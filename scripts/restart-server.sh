#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
# 实例隔离：stable / test 各有自己的服务名、状态目录与通道；避免更新测试版时重启稳定版。
INSTANCE="${TERMINAL_INSTANCE:-stable}"
if [ "$INSTANCE" = "stable" ]; then
  CHANNEL="${TERMINAL_CHANNEL:-stable}"
  SERVICE="${SERVICE_NAME:-stellar-resonance}"
  STATE_DIR="server/.local"
  EDITOR_PORT="${EDITOR_PORT:-8808}"
else
  CHANNEL="${TERMINAL_CHANNEL:-test}"
  SERVICE="${SERVICE_NAME:-stellar-resonance-$INSTANCE}"
  STATE_DIR="server/.local/instances/$INSTANCE"
  EDITOR_PORT="${EDITOR_PORT:-9001}"
fi
ORIGIN="${1:-}"
if [ -z "$ORIGIN" ]; then
  echo '用法：bash scripts/restart-server.sh http://公网IP:8807　（测试实例先 export TERMINAL_INSTANCE=test）'
  exit 1
fi
APP_PORT="$(node --input-type=module -e '
const u=new URL(process.argv[1]);
if(u.protocol!=="http:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw Error("请输入完整 HTTP 公网地址，不带路径");
console.log(u.port||80);
' "$ORIGIN")"

if command -v systemctl >/dev/null && systemctl --user is-active --quiet "$SERVICE" 2>/dev/null; then
  echo "检测到 systemd 用户服务 $SERVICE，按服务现有配置重启。"
  systemctl --user restart "$SERVICE"
  exit 0
fi

# Only stop a live process whose health identity, working directory and command
# all belong to this project. A stale PID alone is never enough.
OLD_PID="$(node --input-type=module -e '
import {createHash} from "node:crypto";
import {readFile,realpath} from "node:fs/promises";
const [root,port,channel]=process.argv.slice(1);
let response;
try{response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(4000)});}catch(e){if(e.cause?.code==="ECONNREFUSED"){console.log(0);process.exit(0);}throw e;}
if(!response.ok)throw Error("端口已有其他服务，请先检查");
const h=await response.json();
if(h.app!=="stellar-resonance-local"||h.projectId!==createHash("sha256").update(root).digest("hex").slice(0,16)||!Number.isSafeInteger(h.pid)||h.pid<=1)throw Error("进程不是本项目，已停止操作");
if((h.channel||"stable")!==channel)throw Error("该端口运行的是另一个通道实例，已停止操作");
const cwd=await realpath(`/proc/${h.pid}/cwd`);
const args=(await readFile(`/proc/${h.pid}/cmdline`,"utf8")).split("\0");
if(cwd!==root||!args.some(a=>["server.mjs",`${root}/server.mjs`,"server/index.mjs",`${root}/server/index.mjs`].includes(a)))throw Error("进程路径不匹配，已停止操作");
console.log(h.pid);
' "$ROOT" "$APP_PORT" "$CHANNEL")"
if [ "$OLD_PID" != 0 ]; then
  kill -TERM "$OLD_PID"
  for _ in $(seq 1 30); do
    if ! kill -0 "$OLD_PID" 2>/dev/null; then break; fi
    sleep 0.2
  done
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo '旧进程尚未退出，请检查后重试；没有强制结束。'
    exit 1
  fi
fi
mkdir -p "$STATE_DIR"
if command -v systemctl >/dev/null && systemctl --user cat "$SERVICE.service" >/dev/null 2>&1; then
  echo "启动已安装的 systemd 用户服务 $SERVICE。"
  systemctl --user start "$SERVICE.service"
  exit 0
fi
HOST=0.0.0.0 PORT="$APP_PORT" EDITOR_PORT="$EDITOR_PORT" PUBLIC_ORIGIN="$ORIGIN" AUTH_REQUIRED=1 \
  TERMINAL_CHANNEL="$CHANNEL" TERMINAL_INSTANCE="$INSTANCE" \
  nohup node "$ROOT/server.mjs" >> "$STATE_DIR/deploy.log" 2>&1 </dev/null &
NEW_PID=$!
for _ in $(seq 1 20); do
  if ! kill -0 "$NEW_PID" 2>/dev/null; then
    tail -n 30 "$STATE_DIR/deploy.log"
    exit 1
  fi
  if node --input-type=module -e 'const r=await fetch(`http://127.0.0.1:${process.argv[1]}/api/health`,{signal:AbortSignal.timeout(1000)});if(!r.ok)process.exit(1);const h=await r.json();if(!h.accountsRequired||(h.channel||"stable")!==process.argv[2])process.exit(1);' "$APP_PORT" "$CHANNEL" >/dev/null 2>&1; then
    echo "服务已启动（$CHANNEL）：$ORIGIN/terminal"
    exit 0
  fi
  sleep 0.5
done
echo "服务尚未就绪，请查看 $STATE_DIR/deploy.log。"
exit 1
