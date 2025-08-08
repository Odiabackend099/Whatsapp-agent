// utils/agents.js
const AGENTS = {
  LEXI: {
    name: 'Lexi',
    price: 15000,
    keywords: ['business', 'automation', 'whatsapp', 'marketing', 'sales']
  },
  MISS: {
    name: 'MISS',
    price: 0,
    keywords: ['university', 'admission', 'student', 'mudiame', 'education', 'school']
  },
  ATLAS: {
    name: 'Atlas',
    price: 25000,
    keywords: ['luxury', 'travel', 'hotel', 'premium', 'exclusive', 'concierge']
  },
  LEGAL: {
    name: 'Legal',
    price: 20000,
    keywords: ['legal', 'contract', 'compliance', 'ndpr', 'privacy', 'policy']
  }
};

function getAgentForMessage(message='') {
  const m = (message || '').toLowerCase();
  for (const [key, agent] of Object.entries(AGENTS)) {
    if (agent.keywords.some(k => m.includes(k))) return key;
  }
  return 'LEXI';
}

function getAgentPrompt(agent='LEXI') {
  const common = `You are an ODIA.dev Nigerian voice AI agent. Be clear, direct, realistic. Use Nigerian English or light Pidgin when helpful. Respect Lagos timezone, be concise, avoid fluff.`;
  switch(agent) {
    case 'LEXI':
      return `${common}
Role: WhatsApp Business Automation Specialist (Lexi).
Goal: qualify leads, explain pricing (₦15,000/month), push for WhatsApp automation outcomes, book demos.
Constraints: short messages, clear next step.`;
    case 'MISS':
      return `${common}
Role: University Support Agent (MISS) for Mudiame University.
Languages: English, Yoruba, Igbo (detect and reply if user greets in Yoruba/Igbo).
Tasks: admissions, courses, fees, campus info.`;
    case 'ATLAS':
      return `${common}
Role: Luxury Concierge (Atlas).
Tone: premium but not waffly. Offer hotels/travel and upsell packages (₦25,000/month).`;
    case 'LEGAL':
      return `${common}
Role: NDPR Compliance Assistant (Legal).
Scope: NDPR, privacy policy guidance, contract basics. No legal advice disclaimer. Pricing ₦20,000/month.`;
    default:
      return common;
  }
}

module.exports = { AGENTS, getAgentForMessage, getAgentPrompt };
