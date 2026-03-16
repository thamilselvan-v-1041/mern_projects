#!/usr/bin/env bash
# Start live-stock API server and Vite client
DIR="$(cd "$(dirname "$0")" && pwd)"

# Get network IP for remote access (macOS: en0, Linux: first non-loopback)
REMOTE_IP=$(node -e "
  const os=require('os');
  for(const n of Object.values(os.networkInterfaces())) {
    for(const i of n||[]) {
      if(i.family==='IPv4'&&!i.internal) { console.log(i.address); process.exit(0); }
    }
  }
  console.log('127.0.0.1');
" 2>/dev/null) || REMOTE_IP="127.0.0.1"

# Kill existing servers
echo "Stopping existing servers..."
lsof -ti:3001,5177 | xargs kill -9 2>/dev/null || true
sleep 2

# 1. API server (binds to 0.0.0.0 for network access)
echo "Starting API server on http://${REMOTE_IP}:3001..."
(cd "$DIR" && node server/index.js) &
sleep 2

# 2. Vite client (host 0.0.0.0 for network access)
echo "Starting Vite client on http://${REMOTE_IP}:5177..."
(cd "$DIR/client" && npm run dev:client-only) &

echo ""
echo "Servers starting:"
echo "  API:    http://${REMOTE_IP}:3001"
echo "  Client: http://${REMOTE_IP}:5177"
echo ""
echo "Run ./stop-server.sh to stop all servers"
