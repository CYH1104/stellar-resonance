#!/usr/bin/env bash
# Run as the ordinary account which owns the project, e.g. ubuntu.
set -Eeuo pipefail
install_auto_update() {
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
ORIGIN="${1:-http://43.138.251.91:8807}"
if [ "$(id -u)" = 0 ]; then echo '请用项目所属用户运行，不要 sudo bash 此脚本。' >&2; exit 1; fi
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh"; nvm use 24 --silent >/dev/null; fi
NODE="$(command -v node)"
APP_PORT="$("$NODE" --input-type=module -e 'const u=new URL(process.argv[1]);if(u.protocol!=="http:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw Error("请输入完整 HTTP 公网地址，不带路径");console.log(u.port||80);' "$ORIGIN")"
systemctl --user show-environment >/dev/null
if [ "$(loginctl show-user "$(id -un)" -p Linger --value)" != yes ]; then sudo loginctl enable-linger "$(id -un)"; fi
unit_quote(){ local value="${1//\\/\\\\}"; value="${value//\"/\\\"}"; value="${value//%/%%}"; printf '"%s"' "$value"; }
unit_dir="$HOME/.config/systemd/user"
mkdir -p "$unit_dir"
# Keep an existing game service's configuration rather than replacing it.
if ! systemctl --user cat stellar-resonance.service >/dev/null 2>&1; then
  cat > "$unit_dir/stellar-resonance.service" <<EOF
[Unit]
Description=Stellar Resonance game server

[Service]
Type=simple
WorkingDirectory=$(unit_quote "$ROOT")
ExecStart=$(unit_quote "$NODE") $(unit_quote "$ROOT/server.mjs")
Environment="HOST=0.0.0.0" "PORT=$APP_PORT" "AUTH_REQUIRED=1"
Environment=$(unit_quote "PUBLIC_ORIGIN=$ORIGIN")
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
fi
cat > "$unit_dir/stellar-resonance-auto-update.service" <<EOF
[Unit]
Description=Check main and deploy Stellar Resonance updates

[Service]
Type=oneshot
WorkingDirectory=$(unit_quote "$ROOT")
ExecStart=/bin/bash $(unit_quote "$ROOT/scripts/auto-update-server.sh") $(unit_quote "$ORIGIN")
TimeoutStartSec=15min
EOF
cat > "$unit_dir/stellar-resonance-auto-update.timer" <<'EOF'
[Unit]
Description=Check Stellar Resonance main every minute

[Timer]
OnBootSec=60s
OnUnitInactiveSec=60s
AccuracySec=5s
Unit=stellar-resonance-auto-update.service

[Install]
WantedBy=timers.target
EOF
systemctl --user daemon-reload
# This also seeds last-deployed-main only after build and health checks pass.
bash scripts/update-server.sh "$ORIGIN"
systemctl --user enable stellar-resonance.service
systemctl --user enable --now stellar-resonance-auto-update.timer
echo '已启用自动更新：每分钟检查 main，新提交自动备份、构建和重启；无变化不操作。'
echo '日志：journalctl --user -u stellar-resonance-auto-update.service -n 80 --no-pager'
echo '暂停：systemctl --user disable --now stellar-resonance-auto-update.timer'
}
install_auto_update "$@"; exit 0
