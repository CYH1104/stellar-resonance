#!/usr/bin/env bash
# Always deploy the latest shared main snapshot; never merge server changes.
set -euo pipefail
update_server() {
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
ORIGIN="${1:-http://43.138.251.91:8807}"
command -v git >/dev/null
command -v node >/dev/null
command -v pnpm >/dev/null
APP_PORT="$(node --input-type=module -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<24||(major===24&&minor<12))throw Error("需要 Node.js 24.12 或更新版");const u=new URL(process.argv[1]);if(u.protocol!=="http:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw Error("请输入完整 HTTP 公网地址，不带路径");console.log(u.port||80);' "$ORIGIN")"
test "$(git rev-parse --show-toplevel)" = "$ROOT"
mkdir -p server/.local
exec 200>server/.local/update.lock
flock -n 200 || { echo '另一次更新正在执行。'; exit 1; }
# A previous --single-branch clone may fetch only the old preview branch.
# Register main as well: fetching a ref alone does not make it eligible for
# `git branch --set-upstream-to` in that checkout. Preserve other refspecs.
if ! git config --get-all remote.origin.fetch | grep -Fxq '+refs/heads/main:refs/remotes/origin/main'; then
  git remote set-branches --add origin main
fi
git fetch --prune origin +refs/heads/main:refs/remotes/origin/main
TARGET="$(git rev-parse refs/remotes/origin/main)"
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
git reset --hard "$TARGET"
git checkout -B main "$TARGET"
git branch --set-upstream-to=origin/main main
pnpm install --frozen-lockfile
pnpm build
bash scripts/restart-server.sh "$ORIGIN" 200>&-
curl --noproxy '*' --fail --silent --show-error --max-time 10 "http://127.0.0.1:$APP_PORT/api/health"
printf '\n当前部署：'
git log -1 --oneline
}
# Parse the whole function before reset replaces this script on disk.
update_server "$@"; exit 0
