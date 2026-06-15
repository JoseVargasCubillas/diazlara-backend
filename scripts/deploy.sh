#!/bin/bash
# Run this ON the production server to deploy latest code
set -e

echo ">>> Pulling latest code..."
git pull origin master

echo ">>> Installing dependencies..."
npm install --production=false

echo ">>> Building TypeScript..."
npm run build

echo ">>> Restarting process..."
if command -v pm2 &> /dev/null; then
  pm2 restart all
elif systemctl is-active --quiet diazlara-backend 2>/dev/null; then
  systemctl restart diazlara-backend
else
  echo "WARNING: Could not find pm2 or systemctl service. Restart the Node process manually."
fi

echo ">>> Deploy complete."
