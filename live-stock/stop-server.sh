#!/usr/bin/env bash
# Stop live-stock API server and Vite client
echo "Stopping servers..."
lsof -ti:3001,5177 | xargs kill -9 2>/dev/null || true
echo "All servers stopped."
