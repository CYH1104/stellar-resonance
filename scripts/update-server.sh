#!/usr/bin/env bash
# Always deploy the latest shared main snapshot; never merge server changes.
set -Eeuo pipefail
# 默认一次更新两个端口。单实例入口仅留给明确指定的故障恢复，不作为日常发布方式。
if [ "${STELLAR_SINGLE_INSTANCE_UPDATE:-0}" != 1 ]; then
  exec bash "$(dirname "${BASH_SOURCE[0]}")/update-both-server.sh" "$@"
fi
STAGE='检查环境'
trap 'status=$?; printf "\n更新失败：%s（退出码 %s）。请查看上方报错。\n" "$STAGE" "$status" >&2; exit "$status"' ERR
update_server() {
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
ORIGIN="${1:-http://43.138.251.91:8807}"
# 实例隔离：测试实例只用自有目录、自有锁与自有服务名，更新它不会重启或覆盖稳定版。
INSTANCE="${TERMINAL_INSTANCE:-stable}"
if [ "$INSTANCE" = "stable" ]; then
  CHANNEL="${TERMINAL_CHANNEL:-stable}"
  SERVICE="${SERVICE_NAME:-stellar-resonance}"
  STATE_DIR="server/.local"
else
  CHANNEL="${TERMINAL_CHANNEL:-test}"
  SERVICE="${SERVICE_NAME:-stellar-resonance-$INSTANCE}"
  STATE_DIR="server/.local/instances/$INSTANCE"
fi
export TERMINAL_INSTANCE="$INSTANCE" TERMINAL_CHANNEL="$CHANNEL" SERVICE_NAME="$SERVICE"
command -v git >/dev/null
command -v node >/dev/null
command -v pnpm >/dev/null
printf '\n[1/7] 检查环境\n'
node -v
pnpm -v
APP_PORT="$(node --input-type=module -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<24||(major===24&&minor<12))throw Error("需要 Node.js 24.12 或更新版");const u=new URL(process.argv[1]);if(u.protocol!=="http:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw Error("请输入完整 HTTP 公网地址，不带路径");console.log(u.port||80);' "$ORIGIN")"
test "$(git rev-parse --show-toplevel)" = "$ROOT"
mkdir -p "$STATE_DIR"
exec 200>"$STATE_DIR/update.lock"
flock -n 200 || { echo '另一次更新正在执行。'; exit 1; }
# 两个实例共享同一工作树：reset/install/build 必须串行，否则一次测试版更新会在
# 稳定版构建过程中改掉源码与 dist。锁从取代码一直持有到本实例的快照生成完毕。
mkdir -p server/.local
exec 201>"server/.local/update-tree.lock"
if ! flock -w 1800 201; then
  echo '另一个实例正在更新同一代码树，请稍后重试。'
  exit 1
fi
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
tar --exclude='./.git' --exclude='./node_modules' --exclude='./dist' --exclude='./.integration' --exclude='./server/.local/releases' -czf "$BACKUP/workspace.tar.gz" .
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
STAGE='准备发布快照'
printf '\n[6/7] 构建网页并准备本实例的发布快照\n'
pnpm build
# 每个实例只从自己的快照目录加载页面、代码与依赖。这里只“准备”目标版本，不动已确认指针：
# 新版本必须先用它启动并通过健康检查，才算发布成功。
PREVIOUS_RELEASE="$(node scripts/release-snapshot.mjs --instance "$INSTANCE" --channel "$CHANNEL" --current || true)"
RELEASE_ID="$(node scripts/release-snapshot.mjs --instance "$INSTANCE" --channel "$CHANNEL" --prepare)"
if [ -z "$RELEASE_ID" ]; then
  echo '无法准备发布快照。'
  exit 1
fi
printf '{"buildId":"%s"}\n' "$RELEASE_ID" > "$STATE_DIR/pending-release.json"
flock -u 201
STAGE='重启与启动检查'
printf '\n[7/7] 重启服务并检查启动状态（目标快照 %s）\n' "$RELEASE_ID"
# 发布最后一步的状态机在这里：重启失败、端口起不来、健康检查不过都走同一条回滚路径
# （核对旧版本后清理 pending），不能让 bash 的非零退出把回滚整段跳过。
node scripts/release-deploy.mjs \
  --instance "$INSTANCE" --channel "$CHANNEL" --state-dir "$STATE_DIR" \
  --target "$RELEASE_ID" --previous "$PREVIOUS_RELEASE" --origin "$ORIGIN" --port "$APP_PORT"
# 走到这里说明目标快照已健康并且已经确认（commitRelease 只在健康检查通过后调用），
# 才推进 last-deployed；上面的非零退出由顶部 ERR trap 接管，脚本不会带着半成品状态继续。
# HEAD alone is insufficient: installation/build may have failed after reset.
printf '%s\n' "$TARGET" > "$STATE_DIR/last-deployed-main.tmp"
mv -- "$STATE_DIR/last-deployed-main.tmp" "$STATE_DIR/last-deployed-main"
printf '\n更新完成，服务已启动（%s 通道）。\n当前部署：' "$CHANNEL"
git --no-pager log -1 --oneline
printf '游戏地址：%s/terminal\n管理页面：%s/editor/\n' "${ORIGIN%/}" "${ORIGIN%/}"
echo '以上为服务器本机启动检查；公网可达性还取决于安全组和网络。'
}
# Parse the whole function before reset replaces this script on disk.
update_server "$@"; exit 0
