#!/usr/bin/env bash
# Always deploy the latest shared main snapshot; never merge server changes.
set -Eeuo pipefail
STAGE='检查环境'
trap 'status=$?; printf "\n更新失败：%s（退出码 %s）。请查看上方报错。\n" "$STAGE" "$status" >&2; exit "$status"' ERR
update_server() {
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
ORIGIN="${1:-http://43.138.251.91:8807}"
command -v git >/dev/null
command -v node >/dev/null
command -v pnpm >/dev/null
printf '\n[1/7] 检查环境\n'
node -v
pnpm -v
APP_PORT="$(node --input-type=module -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<24||(major===24&&minor<12))throw Error("需要 Node.js 24.12 或更新版");const u=new URL(process.argv[1]);if(u.protocol!=="http:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw Error("请输入完整 HTTP 公网地址，不带路径");console.log(u.port||80);' "$ORIGIN")"
test "$(git rev-parse --show-toplevel)" = "$ROOT"
mkdir -p server/.local
exec 200>server/.local/update.lock
flock -n 200 || { echo '另一次更新正在执行。'; exit 1; }
# A previous --single-branch clone may fetch only the old preview branch.
# Register main as well: fetching a ref alone does not make it eligible for
# `git branch --set-upstream-to` in that checkout. Preserve other refspecs.
STAGE='获取 main 最新代码'
printf '\n[2/7] 获取 main 最新代码\n'
if ! git config --get-all remote.origin.fetch | grep -Fxq '+refs/heads/main:refs/remotes/origin/main'; then
  git remote set-branches --add origin main
fi
git fetch --prune origin +refs/heads/main:refs/remotes/origin/main
TARGET="$(git rev-parse refs/remotes/origin/main)"
printf '更新前：'
git --no-pager log -1 --oneline
printf '目标版本：'
git --no-pager log -1 --oneline "$TARGET"
printf '\n本次代码变化：\n'
if git diff --quiet HEAD "$TARGET" --; then
  echo '代码已是最新，继续安装、构建和重启检查。'
else
  git --no-pager diff --stat HEAD "$TARGET" --
fi
if ! git diff --quiet HEAD --; then
  echo '检测到本地代码修改：备份后将按 main 覆盖。'
fi
# Refuse a remote snapshot that would track and replace deployment secrets/data.
if git ls-tree -r --name-only "$TARGET" | LC_ALL=C grep -Eq '^(server/(private|\.local)(/|$)|server\.config\.json$|\.env($|\.))'; then
  echo '仓库包含服务器私有配置或数据路径，已停止覆盖。'
  exit 1
fi
if git ls-files | LC_ALL=C grep -Eq '^(server/(private|\.local)(/|$)|\.env($|\.))'; then
  echo '本地 Git 跟踪了私有配置或数据，请先移出版本控制再更新。'
  exit 1
fi
# Keep a restorable copy outside the checkout before overwriting code.
STAGE='备份当前文件'
printf '\n[3/7] 备份当前文件\n'
BACKUP_ROOT="$(dirname "$ROOT")/.stellar-resonance-backups"
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
BACKUP="$(mktemp -d "$BACKUP_ROOT/update-$(date +%Y%m%d-%H%M%S)-XXXXXX")"
chmod 700 "$BACKUP"
git rev-parse HEAD > "$BACKUP/previous-commit.txt"
printf '%s\n' "$TARGET" > "$BACKUP/target-commit.txt"
tar --exclude='./.git' --exclude='./node_modules' --exclude='./dist' --exclude='./.integration' -czf "$BACKUP/workspace.tar.gz" .
chmod 600 "$BACKUP/workspace.tar.gz"
echo "更新前备份：$BACKUP"
# Older releases tracked this machine-specific file. Keep the actual file,
# remove only its index entry before resetting to the new untracked layout.
if git ls-files --error-unmatch server.config.json >/dev/null 2>&1; then
  git rm --cached -- server.config.json
fi
# Runtime directories are ignored/untracked. Do not run git clean.
STAGE='覆盖 main 代码'
printf '\n[4/7] 覆盖 main 代码\n'
git reset --hard "$TARGET"
git checkout -B main "$TARGET"
git branch --set-upstream-to=origin/main main
STAGE='安装依赖'
printf '\n[5/7] 安装依赖：pnpm install --frozen-lockfile\n'
pnpm install --frozen-lockfile
STAGE='构建网页'
printf '\n[6/7] 构建网页：pnpm build\n'
pnpm build
STAGE='重启与启动检查'
printf '\n[7/7] 重启服务并检查启动状态\n'
bash scripts/restart-server.sh "$ORIGIN" 200>&-
node --input-type=module -e '
import {createHash} from "node:crypto";
const [root,port]=process.argv.slice(1),projectId=createHash("sha256").update(root).digest("hex").slice(0,16);
let last="未收到健康响应";
for(let attempt=0;attempt<20;attempt++){
  try{
    const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1000)});
    if(!response.ok)throw Error(`健康检查 HTTP ${response.status}`);
    const info=await response.json();
    if(info.app!=="stellar-resonance-local"||info.projectId!==projectId||!info.accountsRequired||!Number.isSafeInteger(info.pid)||info.pid<=1)throw Error("健康信息与当前项目或账号配置不匹配");
    console.log(`启动检查通过：端口 ${port}，进程 PID ${info.pid}，应用版本 ${info.version}，账号系统已启用。`);
    process.exit(0);
  }catch(error){last=error.message;}
  await new Promise(resolve=>setTimeout(resolve,500));
}
throw Error(`服务启动检查失败：${last}。请查看 server/.local/deploy.log 或 systemd 日志。`);
' "$ROOT" "$APP_PORT"
printf '\n更新完成，服务已启动。\n当前部署：'
git --no-pager log -1 --oneline
printf '游戏地址：%s/terminal\n管理页面：%s/editor/\n' "${ORIGIN%/}" "${ORIGIN%/}"
echo '以上为服务器本机启动检查；公网可达性还取决于安全组和网络。'
}
# Parse the whole function before reset replaces this script on disk.
update_server "$@"; exit 0
