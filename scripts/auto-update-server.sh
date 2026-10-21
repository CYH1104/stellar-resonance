#!/usr/bin/env bash
# One quiet check, scheduled by the user systemd timer.
set -Eeuo pipefail
auto_update_server() {
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
ORIGIN="${1:-http://43.138.251.91:8807}"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm use 24 --silent >/dev/null
fi
mkdir -p server/.local
exec 201>server/.local/auto-update.lock
flock -n 201 || exit 0
# A manual deployment already owns the regular update lock: leave it alone.
flock -n server/.local/update.lock true || exit 0
export GIT_TERMINAL_PROMPT=0
export GIT_CONFIG_COUNT=3
export GIT_CONFIG_KEY_0=http.version GIT_CONFIG_VALUE_0=HTTP/1.1
export GIT_CONFIG_KEY_1=http.lowSpeedLimit GIT_CONFIG_VALUE_1=100
export GIT_CONFIG_KEY_2=http.lowSpeedTime GIT_CONFIG_VALUE_2=20
remote="$(timeout 45s git ls-remote --exit-code origin refs/heads/main)"
target="${remote%%[[:space:]]*}"
[[ "$target" =~ ^[[:xdigit:]]{40}$ ]] || { echo '无法读取远程 main 提交。' >&2; exit 1; }
deployed=''
if [ -f server/.local/last-deployed-main ]; then read -r deployed < server/.local/last-deployed-main; fi
if [ "$target" = "$deployed" ] && [ "$target" = "$(git rev-parse HEAD)" ]; then exit 0; fi
# Failed builds must retry even if git reset has already moved HEAD to target.
if [ -f server/.local/auto-update-failed ]; then
  read -r failed_sha failed_at < server/.local/auto-update-failed || true
  if [ "${failed_sha:-}" = "$target" ] && [[ "${failed_at:-}" =~ ^[0-9]+$ ]] && (( $(date +%s) - failed_at < 300 )); then exit 0; fi
fi
printf '%s 检测到 main 更新：%s，开始部署。\n' "$(date -Is)" "$target"
# Runtime processes must never inherit the polling lock.
if bash scripts/update-server.sh "$ORIGIN" 201>&-; then
  rm -f -- server/.local/auto-update-failed
else
  status=$?
  printf '%s %s\n' "$target" "$(date +%s)" > server/.local/auto-update-failed
  echo '自动部署失败；同一提交将在至少5分钟后重试，下一条新提交可立即尝试。' >&2
  exit "$status"
fi
}
auto_update_server "$@"; exit 0
