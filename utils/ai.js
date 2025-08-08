// utils/ai.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function callZai(systemPrompt, userMessage) {
  const resp = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ZAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.ZAI_MODEL || 'glm-4.5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    })
  });
  if (!resp.ok) throw new Error(`Z.ai ${resp.status}`);
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Z.ai empty response');
  return content;
}

async function callClaude(systemPrompt, userMessage) {
  // Minimal Claude fallback (Messages API)
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  if (!resp.ok) throw new Error(`Claude ${resp.status}`);
  const data = await resp.json();
  const content = data?.content?.[0]?.text;
  if (!content) throw new Error('Claude empty');
  return content;
}

module.exports = { callZai, callClaude };
