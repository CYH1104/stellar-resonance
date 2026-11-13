#!/usr/bin/env bash
# Fetch and build once, then publish the same immutable release to both ports.
set -Eeuo pipefail
STAGE='检查环境'
trap 'status=$?; printf "双端更新失败：%s（退出码 %s）。\n" "$STAGE" "$status" >&2; exit "$status"' ERR
update_both() {
  local ROOT ORIGIN STABLE_ORIGIN TEST_ORIGIN TARGET BACKUP BACKUP_ROOT
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
  cd "$ROOT"
  ORIGIN="${1:-http://43.138.251.91:8807}"
  command -v git >/dev/null; command -v node >/dev/null; command -v pnpm >/dev/null
  read -r STABLE_ORIGIN TEST_ORIGIN < <(node --input-type=module -e '
    const [major,minor]=process.versions.node.split(".").map(Number);
    if(major<24||(major===24&&minor<12))throw Error("需要 Node.js 24.12 或更新版");
    const u=new URL(process.argv[1]);
    if(u.protocol!=="http:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash||![8807,9000].includes(Number(u.port)))throw Error("请输入 8807 或 9000 的完整 HTTP 地址，不带路径");
    u.port="8807";const a=u.origin;u.port="9000";console.log(a,u.origin);
  ' "$ORIGIN")
  test -n "$STABLE_ORIGIN"; test -n "$TEST_ORIGIN"
  test "$(git rev-parse --show-toplevel)" = "$ROOT"
  mkdir -p server/.local/instances/test
  # Lock both identities and the shared build tree, including explicit single-instance operations.
  exec 200>server/.local/update.lock
  flock -n 200 || { echo '8807 的另一次更新正在执行。'; exit 1; }
  exec 202>server/.local/instances/test/update.lock
  flock -n 202 || { echo '9000 的另一次更新正在执行。'; exit 1; }
  exec 201>server/.local/update-tree.lock
  flock -w 1800 201
  test ! -e server/.local/pending-release.json
  test ! -e server/.local/instances/test/pending-release.json
  STAGE='获取 main 最新代码'
  if ! git config --get-all remote.origin.fetch | grep -Fxq '+refs/heads/main:refs/remotes/origin/main'; then
    git remote set-branches --add origin main
  fi
  git fetch --prune origin +refs/heads/main:refs/remotes/origin/main
  TARGET="$(git rev-parse refs/remotes/origin/main)"
  printf '双端目标提交：%s\n' "$TARGET"
  if git ls-tree -r --name-only "$TARGET" | LC_ALL=C grep -Eq '^(server/(private|\.local)(/|$)|server\.config\.json$|\.env($|\.))'; then
    echo '远程包含私有配置或数据路径，已停止。'; exit 1
  fi
  if git ls-files | LC_ALL=C grep -Eq '^(server/(private|\.local)(/|$)|\.env($|\.))'; then
    echo '本地跟踪了私有数据路径，已停止。'; exit 1
  fi
  STAGE='备份更新前文件'
  BACKUP_ROOT="$(dirname "$ROOT")/.stellar-resonance-backups"
  mkdir -p "$BACKUP_ROOT"; chmod 700 "$BACKUP_ROOT"
  BACKUP="$(mktemp -d "$BACKUP_ROOT/paired-$(date +%Y%m%d-%H%M%S)-XXXXXX")"
  chmod 700 "$BACKUP"
  git rev-parse HEAD > "$BACKUP/previous-commit.txt"
  printf '%s\n' "$TARGET" > "$BACKUP/target-commit.txt"
  tar --exclude='./.git' --exclude='./node_modules' --exclude='./dist' --exclude='./.integration' --exclude='./server/.local/releases' -czf "$BACKUP/workspace.tar.gz" .
  chmod 600 "$BACKUP/workspace.tar.gz"
  echo "更新前备份：$BACKUP"
  if git ls-files --error-unmatch server.config.json >/dev/null 2>&1; then git rm --cached -- server.config.json; fi
  STAGE='同步已备份代码并构建'
  git reset --hard "$TARGET"
  git checkout -B main "$TARGET"
  git branch --set-upstream-to=origin/main main
  pnpm install --frozen-lockfile
  pnpm build
  STAGE='双端发布与回滚检查'
  # The child must not pass the locks to systemd or any fallback service process.
  node scripts/release-pair.mjs --stable-origin "$STABLE_ORIGIN" --test-origin "$TEST_ORIGIN" --commit "$TARGET"
  printf '双端更新完成：8807 与 9000 为同一版本，手机功能均可用。\n'
}
# Parse before git reset can replace this file on disk.
update_both "$@"; exit 0
