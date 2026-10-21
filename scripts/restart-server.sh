#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
ORIGIN="${1:-}"
if [ -z "$ORIGIN" ]; then
  echo '用法：bash scripts/restart-server.sh http://公网IP:8807'
  exit 1
fi
APP_PORT="$(node --input-type=module -e '
const u=new URL(process.argv[1]);
if(u.protocol!=="http:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw Error("请输入完整 HTTP 公网地址，不带路径");
console.log(u.port||80);
' "$ORIGIN")"

if command -v systemctl >/dev/null && systemctl --user is-active --quiet stellar-resonance 2>/dev/null; then
  echo '检测到 systemd 用户服务，按服务现有配置重启。'
  systemctl --user restart stellar-resonance
  exit 0
fi

# Only stop a live process whose health identity, working directory and command
# all belong to this project. A stale PID alone is never enough.
OLD_PID="$(node --input-type=module -e '
import {createHash} from "node:crypto";
import {readFile,realpath} from "node:fs/promises";
const [root,port]=process.argv.slice(1);
let response;
try{response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(4000)});}catch(e){if(e.cause?.code==="ECONNREFUSED"){console.log(0);process.exit(0);}throw e;}
if(!response.ok)throw Error("端口已有其他服务，请先检查");
const h=await response.json();
if(h.app!=="stellar-resonance-local"||h.projectId!==createHash("sha256").update(root).digest("hex").slice(0,16)||!Number.isSafeInteger(h.pid)||h.pid<=1)throw Error("进程不是本项目，已停止操作");
const cwd=await realpath(`/proc/${h.pid}/cwd`);
const args=(await readFile(`/proc/${h.pid}/cmdline`,"utf8")).split("\0");
if(cwd!==root||!args.some(a=>["server.mjs",`${root}/server.mjs`,"server/index.mjs",`${root}/server/index.mjs`].includes(a)))throw Error("进程路径不匹配，已停止操作");
console.log(h.pid);
' "$ROOT" "$APP_PORT")"
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
mkdir -p server/.local
if command -v systemctl >/dev/null && systemctl --user cat stellar-resonance.service >/dev/null 2>&1; then
  echo '启动已安装的 systemd 用户服务。'
  systemctl --user start stellar-resonance.service
  exit 0
fi
HOST=0.0.0.0 PORT="$APP_PORT" PUBLIC_ORIGIN="$ORIGIN" AUTH_REQUIRED=1 \
  nohup node "$ROOT/server.mjs" >> server/.local/deploy.log 2>&1 </dev/null &
NEW_PID=$!
for _ in $(seq 1 20); do
  if ! kill -0 "$NEW_PID" 2>/dev/null; then
    tail -n 30 server/.local/deploy.log
    exit 1
  fi
  if node --input-type=module -e 'const r=await fetch(`http://127.0.0.1:${process.argv[1]}/api/health`,{signal:AbortSignal.timeout(1000)});if(!r.ok||!(await r.json()).accountsRequired)process.exit(1);' "$APP_PORT" >/dev/null 2>&1; then
    echo "服务已启动：$ORIGIN/terminal"
    exit 0
  fi
  sleep 0.5
done
echo '服务尚未就绪，请查看 server/.local/deploy.log。'
exit 1
