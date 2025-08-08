#!/usr/bin/env bash
set -e

echo "🔐 Checking Vercel CLI..."
if ! command -v vercel >/dev/null 2>&1; then
  npm i -g vercel
fi

echo "📦 Installing deps..."
npm ci || npm install

echo "🚀 Deploying to Vercel (prod)..."
vercel --prod --confirm

echo "✅ Done. Set Twilio webhook to: {PUBLIC_URL}/webhooks/twilio"
