// utils/payments.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

/**
 * Create a Flutterwave payment and return redirect link.
 * This uses the /v3/payments endpoint with a redirect_url.
 */
async function createPayment({ phone, plan, email }) {
  const amountMap = { LEXI: 15000, MISS: 0, ATLAS: 25000, LEGAL: 20000 };
  const amount = amountMap[plan] ?? 15000;

  const payload = {
    tx_ref: `ODIA-${Date.now()}-${Math.floor(Math.random()*1e6)}`,
    amount,
    currency: 'NGN',
    redirect_url: process.env.FLW_REDIRECT_URL || 'https://odia.dev/thank-you',
    customer: { email, phonenumber: phone, name: email.split('@')[0] },
    meta: { plan }
  };

  const resp = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await resp.json();
  if (!resp.ok || !data?.status === 'success') {
    throw new Error(`Flutterwave error: ${resp.status} ${JSON.stringify(data)}`);
  }

  const link = data?.data?.link;
  return { checkout_link: link, tx_ref: payload.tx_ref, amount };
}

module.exports = { createPayment };
