#!/bin/sh
# Removes the page statistics of the test site (the include line, the files, the cron job). Run as root.
set -eu
SITE=/etc/nginx/sites-enabled/freshbubbles.pt
sed -i '/snippets\/engenui-stats.conf/d' "$SITE"
rm -f /etc/nginx/snippets/engenui-stats.conf /etc/nginx/conf.d/engenui-ping.conf /etc/cron.d/engenui-stats /etc/logrotate.d/engenui-ping /usr/local/bin/engenui-stats.py
nginx -t
systemctl reload nginx
echo "removed. The data stays in /var/log/engenui and /var/lib/engenui-stats until you delete those folders."
