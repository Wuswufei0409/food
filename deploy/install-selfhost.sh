#!/usr/bin/env bash
set -euo pipefail
# Prepared specifically for this project's first installation. Re-running does
# not overwrite secrets, the current release, existing service, or answer data.
[[ $(id -u) == 0 ]] || { echo 'Run as root.'; exit 1; }
[[ ! -e /etc/yingxue-dinner.env && ! -e /opt/yingxue-dinner/current ]] || { echo 'Existing installation found; use a reviewed release update.'; exit 1; }
cd /root
sha256sum -c node-runtime.sha256
sha256sum -c yingxue-selfhost.sha256
install -d -m 755 /opt/yingxue-runtime /opt/yingxue-dinner/releases/initial
tar -xJf node-v24.22.2-linux-x64.tar.xz --strip-components=1 -C /opt/yingxue-runtime
tar -xzf yingxue-selfhost.tar.gz -C /opt/yingxue-dinner/releases/initial
id yingxue-dinner >/dev/null 2>&1 || useradd --system --home-dir /var/lib/yingxue-dinner --shell /sbin/nologin yingxue-dinner
install -d -m 700 -o yingxue-dinner -g yingxue-dinner /var/lib/yingxue-dinner /var/lib/yingxue-dinner/backups
install -m 600 -o root -g root /root/aliyun-server.env /etc/yingxue-dinner.env
ln -s /opt/yingxue-dinner/releases/initial /opt/yingxue-dinner/current
chmod -R a+rX /opt/yingxue-runtime /opt/yingxue-dinner/releases/initial
export DATABASE_PATH=/var/lib/yingxue-dinner/answers.sqlite
/opt/yingxue-runtime/bin/node /opt/yingxue-dinner/current/maintenance.mjs import /root/original-site-answers.json
chown -R yingxue-dinner:yingxue-dinner /var/lib/yingxue-dinner
install -m 644 /root/yingxue-dinner.service /etc/systemd/system/yingxue-dinner.service
systemctl daemon-reload
systemctl enable --now yingxue-dinner
systemctl is-active yingxue-dinner
echo 'Service installed. Verify local health and public port access separately.'
