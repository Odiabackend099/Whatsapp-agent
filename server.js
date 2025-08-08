/**
 * ODIA.dev - Production WhatsApp AI Agent Backend
 * Nigeria-first backend with Twilio, Supabase, Z.ai/Claude, ElevenLabs,
 * Redis caching, Flutterwave billing, Sentry + Winston monitoring.
 *
 * NOTE: This is server code for Vercel serverless *or* Node server.
 * For Vercel, we export the Express app via module.exports.
 */

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { Redis } = require('@upstash/redis');
const twilio = require('twilio');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const moment = require('moment-timezone');
const Sentry = require('@sentry/node');
const Tracing = require('@sentry/tracing');
const winston = require('winston');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const { getAgentForMessage, getAgentPrompt } = require('./utils/agents');
const { callZai, callClaude } = require('./utils/ai');
const { createPayment } = require('./utils/payments');
const { compressIfNeeded, getNetworkHint } = require('./utils/network');
const { logger, requestLogger } = require('./utils/logger');

// ----- App & Middleware -----
const app = express();
const PORT = process.env.PORT || 3000;
const LAGOS_TZ = 'Africa/Lagos';

// Sentry (optional)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.2,
  });
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// CORS
app.use(cors());

// JSON for general routes
app.use(bodyParser.json());

// Logging
app.use(requestLogger);

// Rate limit (general)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400, // generous but safe
  standardHeaders: true,
  legacyHeaders: false,
}));

// ----- Clients -----
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

let redis = null;
if (process.env.REDIS_URL && process.env.REDIS_TOKEN) {
  redis = new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN });
}

// ----- Helpers -----
const NIGERIA_PHONE_REGEX = /^\+234[0-9]{10}$/;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '5gBmGqdd8c8PD5xP7lPE';

function isValidNigerianPhone(phone) {
  return NIGERIA_PHONE_REGEX.test(phone || '');
}

function formatNaira(amount) {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
  } catch {
    return `₦${Number(amount || 0).toLocaleString('en-NG')}`;
  }
}

// use raw parser for Twilio route to validate signature
const twilioUrlencoded = bodyParser.urlencoded({ extended: false });

function validateTwilioSignature(req, res, next) {
  const signature = req.headers['x-twilio-signature'];
  const url = (process.env.PUBLIC_URL || '') + req.originalUrl;
  try {
    const isValid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      signature,
      url,
      req.body
    );
    if (!isValid) return res.status(403).send('Forbidden');
    next();
  } catch (e) {
    logger.error('Twilio signature validation failed', { error: e.message });
    return res.status(403).send('Forbidden');
  }
}

async function supabaseInsert(table, payload) {
  for (let i in [0,1,2]) {
    const { data, error } = await supabase.from(table).insert(payload);
    if (!error) return data;
    await new Promise(r => setTimeout(r, 400 * (i+1)));
    if (i == 2) logger.error(`Supabase insert failed: ${table}`, { error: error.message });
  }
  return null;
}

// Voice generation with caching (Redis first)
async function generateVoice(text, agentKey) {
  const textHash = crypto.createHash('md5').update(`${agentKey}:${text}`).digest('hex');
  const cacheKey = `voice:${agentKey}:${textHash}`;

  // Try Redis
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return Buffer.from(cached, 'base64');
    } catch (e) {
      logger.warn('Redis get failed', { error: e.message });
    }
  }

  // ElevenLabs REST
  const payload = {
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.7, similarity_boost: 0.7 }
  };

  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ELEVENLABS_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`ElevenLabs error: ${resp.status} ${txt}`);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());

  // Compress for Nigerian networks if needed
  const optimized = await compressIfNeeded(buffer);

  // Cache in Redis
  if (redis) {
    try {
      await redis.set(cacheKey, optimized.toString('base64'), { ex: 60 * 60 * 24 * 14 });
    } catch (e) {
      logger.warn('Redis set failed', { error: e.message });
    }
  }

  // Update voice_cache metadata (no blob)
  await supabaseInsert('voice_cache', {
    text_hash: textHash,
    agent_type: agentKey,
    storage: 'redis',
    access_count: 1
  });

  return optimized;
}

// AI response with Z.ai → Claude fallback
async function generateAgentReply(message, agentKey, session) {
  const system = getAgentPrompt(agentKey);
  try {
    const reply = await callZai(system, message);
    return reply;
  } catch (e) {
    logger.warn('Z.ai failed, falling back to Claude', { error: e.message });
    const reply = await callClaude(system, message);
    return reply;
  }
}

// ----- Routes -----

// Health
app.get('/health', async (req, res) => {
  res.json({
    status: 'ok',
    time: moment().tz(LAGOS_TZ).format(),
    supabase: !!process.env.SUPABASE_URL,
    redis: !!redis,
    region: process.env.VERCEL_REGION || 'local'
  });
});

// Twilio WhatsApp webhook
app.post('/webhooks/twilio', twilioUrlencoded, validateTwilioSignature, async (req, res) => {
  try {
    const { Body, From } = req.body || {};

    if (!isValidNigerianPhone(From)) {
      return res.type('text/xml').send(new twilio.twiml.MessagingResponse().message(
        "Only Nigerian (+234) numbers are supported for now."
      ).toString());
    }

    const agentKey = getAgentForMessage(Body);
    const reply = await generateAgentReply(Body, agentKey, { from: From });

    // Log conversation
    await supabaseInsert('conversations', {
      session_id: From,
      platform: 'whatsapp',
      message: Body,
      response: reply,
      agent: agentKey,
      cost: 0
    });

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);
    return res.type('text/xml').send(twiml.toString());
  } catch (e) {
    logger.error('Twilio webhook error', { error: e.stack });
    return res.status(500).send('Internal error');
  }
});

// Telegram webhook
app.post('/webhooks/telegram', async (req, res) => {
  try {
    const update = req.body;
    const message = update?.message;
    if (!message?.text) return res.status(200).json({ ok: true });

    const chatId = message.chat.id;
    const agentKey = getAgentForMessage(message.text);
    const reply = await generateAgentReply(message.text, agentKey, { tg: chatId });

    // Log conversation
    await supabaseInsert('conversations', {
      session_id: `tg_${chatId}`,
      platform: 'telegram',
      message: message.text,
      response: reply,
      agent: agentKey,
      cost: 0
    });

    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: reply })
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    logger.error('Telegram webhook error', { error: e.stack });
    return res.status(200).json({ ok: true });
  }
});

// Voice endpoint
app.post('/speak', async (req, res) => {
  try {
    const { text, agent_type = 'LEXI' } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text required' });

    // Network hint
    const hint = getNetworkHint(req);
    const audio = await Promise.race([
      generateVoice(text, agent_type),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
    ]).catch(() => null);

    if (!audio) {
      return res.status(200).json({ status: 'text_fallback', message: text });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    return res.send(audio);
  } catch (e) {
    logger.error('Speak error', { error: e.stack });
    return res.status(500).json({ error: 'voice failed' });
  }
});

// Payments (Flutterwave)
app.post('/billing/create-checkout', async (req, res) => {
  try {
    const { phone, plan, email } = req.body || {};
    if (!phone || !plan || !email) return res.status(400).json({ error: 'phone, plan, email required' });
    if (!isValidNigerianPhone(phone)) return res.status(400).json({ error: 'must be +234...' });

    const resp = await createPayment({ phone, plan, email });
    return res.json(resp);
  } catch (e) {
    logger.error('Billing error', { error: e.stack });
    return res.status(500).json({ error: 'billing failed' });
  }
});

// Metrics (basic)
app.get('/metrics', async (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    time: moment().tz(LAGOS_TZ).toISOString(),
  });
});

// Sentry error handler (optional)
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// 404
app.use((req, res) => res.status(404).json({ error: 'not found' }));

// Start local server (ignored on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    logger.info(`ODIA.dev backend running on :${PORT}`);
  });
}

module.exports = app;
