#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> Installing backend dependencies…"
cd "$ROOT/backend"
# Use existing venv if present, otherwise install globally
if [ -f "venv/bin/activate" ]; then
  source venv/bin/activate
fi
pip install -r requirements.txt -q

echo "==> Starting backend on http://localhost:8000"
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

echo "==> Installing frontend dependencies…"
cd "$ROOT/frontend"
npm install --silent

echo "==> Starting frontend on http://localhost:5173"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "  pdf2mrk is running!"
echo "  Open: http://localhost:5173"
echo ""
echo "  Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" INT TERM
wait
