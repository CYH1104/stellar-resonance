#!/usr/bin/env bash
set -euo pipefail
umask 077
SOURCE=/home/ubuntu/.cache/ms-playwright/chromium-1228/chrome-linux64
TARGET=/opt/stellar-native-academy/browser-runtime
PROFILE=/etc/apparmor.d/stellar-native-chromium
INCOMING=/home/ubuntu/stellar-native-academy/incoming/generation-20261104
EXPECTED=2d18db9d8608b052b6a552ee00ec1e830f93692e928b65ecc67d693bd33fe801
printf '%s  %s\n' "$EXPECTED" "$SOURCE/chrome" | sha256sum -c -
install -d -o root -g root -m 0755 "$TARGET"
apparmor_parser -Q "$INCOMING/stellar-native-chromium.apparmor"
if test -e "$PROFILE"; then cmp "$PROFILE" "$INCOMING/stellar-native-chromium.apparmor"; else install -o root -g root -m 0644 "$INCOMING/stellar-native-chromium.apparmor" "$PROFILE"; fi
apparmor_parser -r "$PROFILE"
# Reuse the installed browser through a read-only service bind mount. No copy,
# package download, global sysctl change, or sandbox bypass option is needed.
systemd-run --quiet --wait --pipe --collect --unit=stellar-native-browser-probe \
  --property=User=stellar-native --property=Group=stellar-native \
  --property=NoNewPrivileges=yes --property=ProtectHome=yes \
  --property=ProtectSystem=strict --property=PrivateTmp=yes \
  --property=ReadWritePaths=/var/lib/stellar-native-academy/tmp \
  --property=BindReadOnlyPaths="$SOURCE:$TARGET" \
  --property=TasksMax=256 --property=MemoryMax=512M --property=CPUQuota=50% \
  /usr/bin/timeout 60s "$TARGET/chrome" --headless=new --disable-gpu \
  --disable-dev-shm-usage --disable-background-networking --disable-extensions \
  --no-first-run --no-default-browser-check --no-proxy-server \
  --user-data-dir=/var/lib/stellar-native-academy/tmp/native-browser-probe --dump-dom about:blank
