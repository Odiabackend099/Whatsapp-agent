# ODIA.dev – WhatsApp AI Agent Backend (Production)

Nigeria-first backend for WhatsApp/Telegram voice+text AI with Z.ai/Claude, ElevenLabs, Supabase, Redis, Flutterwave.

## Deploy (Vercel)
```bash
cp .env.example .env
# fill envs
npm i
vercel --prod
```

**Twilio Webhook:** `POST {PUBLIC_URL}/webhooks/twilio`  
Set `{PUBLIC_URL}` in `.env` so signature verification passes.

## Endpoints
- `POST /webhooks/twilio` (WhatsApp/SMS, signature-validated)
- `POST /webhooks/telegram`
- `POST /speak` (returns audio/mpeg; falls back to text)
- `POST /billing/create-checkout` (Flutterwave checkout)
- `GET /health`
- `GET /metrics`

## Database
Run `database/schema.sql` in Supabase SQL editor.

## Notes
- Voice cache lives in Redis (cheap, fast).
- AI: Z.ai primary, Claude fallback.
- Audio auto-optimized placeholder (hook ready for ffmpeg).
"# Whatsapp-agent" 
