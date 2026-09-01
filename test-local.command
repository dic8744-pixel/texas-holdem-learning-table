#!/bin/zsh
set -e

POKER_APP_DIR="${0:A:h}"
POKER_NODE_BIN="${POKER_NODE_BIN:-$(command -v node || true)}"
POKER_CODEX_NODE_ROOT="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node"
cd "$POKER_APP_DIR"

if [[ -z "$POKER_NODE_BIN" && -x "$POKER_CODEX_NODE_ROOT/bin/node" ]]; then
  POKER_NODE_BIN="$POKER_CODEX_NODE_ROOT/bin/node"
fi
if [[ -z "$POKER_NODE_BIN" ]]; then
  echo "未找到 Node.js 18+，无法运行自动化测试。请先安装 Node.js 并执行 npm ci。"
  exit 1
fi

if [[ -d "$POKER_CODEX_NODE_ROOT/node_modules" ]]; then
  export NODE_PATH="$POKER_CODEX_NODE_ROOT/node_modules${NODE_PATH:+:$NODE_PATH}"
fi
POKER_TESTS=(
  scripts/test-engine-confidence.mjs
  scripts/test-game-simulation.mjs
  scripts/test-ai-difficulty.mjs
  scripts/test-range-model.mjs
  scripts/test-preflop-policy-pack.mjs
  scripts/test-preflop-policy-trust.mjs
  scripts/test-preflop-runtime-legality.mjs
  scripts/test-solver-routing.mjs
  scripts/test-table-scenarios.mjs
  scripts/audit-coach.mjs
)

for POKER_TEST in "${POKER_TESTS[@]}"; do
  echo "运行 $POKER_TEST"
  if [[ "$POKER_TEST" == "scripts/audit-coach.mjs" ]]; then
    "$POKER_NODE_BIN" "$POKER_TEST" --strict
  else
    "$POKER_NODE_BIN" "$POKER_TEST"
  fi
done

echo "运行 scripts/test-landscape-mobile.cjs"
"$POKER_NODE_BIN" scripts/test-landscape-mobile.cjs
echo "运行 scripts/test-e2e-game.cjs"
"$POKER_NODE_BIN" scripts/test-e2e-game.cjs
echo "全部本地测试通过。"
