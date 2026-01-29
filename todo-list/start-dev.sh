#!/bin/bash

# Script to start both backend and frontend servers

echo "🚀 Starting Todo List Application..."
echo ""

# Check if MongoDB is running (basic check)
if ! pgrep -x "mongod" > /dev/null && ! pgrep -x "mongodb" > /dev/null; then
    echo "⚠️  Warning: MongoDB might not be running."
    echo "   Please ensure MongoDB is started before continuing."
    echo ""
fi

# Start backend in background
echo "📦 Starting backend server..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

# Wait a bit for backend to start
sleep 3

# Start frontend
echo "🎨 Starting frontend server..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Servers started!"
echo "   Backend: http://localhost:5001"
echo "   Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for user interrupt
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

wait
