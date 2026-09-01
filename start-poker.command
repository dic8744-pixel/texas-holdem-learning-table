#!/bin/zsh
set -e

POKER_APP_DIR="${0:A:h}"
POKER_PORT="${POKER_PORT:-8765}"
cd "$POKER_APP_DIR"

/usr/bin/python3 -m http.server "$POKER_PORT" --bind 127.0.0.1 >/tmp/local-poker-study-server.log 2>&1 &
POKER_SERVER_PID=$!
trap 'kill "$POKER_SERVER_PID" 2>/dev/null || true' INT TERM EXIT
sleep 0.6
if ! kill -0 "$POKER_SERVER_PID" 2>/dev/null; then
  echo "启动失败：本地端口 $POKER_PORT 可能已被占用。"
  tail -n 5 /tmp/local-poker-study-server.log 2>/dev/null || true
  exit 1
fi
open "http://127.0.0.1:${POKER_PORT}/poker.html"
echo "本地德州扑克学习桌已启动：http://127.0.0.1:${POKER_PORT}/poker.html"
echo "关闭此终端窗口即可停止本地服务器。"
wait "$POKER_SERVER_PID"
