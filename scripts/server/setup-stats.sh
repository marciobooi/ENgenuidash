#!/bin/sh
# Installs the page statistics of the test site on the server (run as root, from this folder). Idempotent.
# What it touches: /etc/nginx/conf.d/engenui-ping.conf, /etc/nginx/snippets/engenui-stats.conf, ONE include line in
# /etc/nginx/sites-enabled/freshbubbles.pt (a backup is kept), /var/log/engenui, /var/lib/engenui-stats,
# /usr/local/bin/engenui-stats.py, /etc/cron.d/engenui-stats and /etc/logrotate.d/engenui-ping.
set -eu
SITE=/etc/nginx/sites-enabled/freshbubbles.pt
HERE=$(dirname "$0")
mkdir -p /var/log/engenui /var/lib/engenui-stats /etc/nginx/snippets /root/nginx-backup
cat > /etc/nginx/conf.d/engenui-ping.conf <<'CONF'
log_format engenui_ping '$time_iso8601 $arg_v $arg_e $arg_a $arg_l $arg_n $arg_d';
CONF
cp "$HERE/engenui-stats.nginx.conf" /etc/nginx/snippets/engenui-stats.conf
install -m 755 "$HERE/engenui-stats.py" /usr/local/bin/engenui-stats.py
if ! grep -q 'snippets/engenui-stats.conf' "$SITE"; then
  cp "$SITE" "/root/nginx-backup/freshbubbles.pt.before-stats.$(date +%Y%m%d%H%M%S)"
  # one include line, before "location = /test {"
  sed -i '0,/location = \/test {/s//include \/etc\/nginx\/snippets\/engenui-stats.conf;\n    location = \/test {/' "$SITE"
fi
if ! nginx -t 2>/dev/null; then
  echo "nginx -t failed: restoring the backup" >&2
  cp "$(ls -t /root/nginx-backup/freshbubbles.pt.before-stats.* | head -1)" "$SITE"
  nginx -t
  exit 1
fi
printf '*/5 * * * * root /usr/bin/python3 /usr/local/bin/engenui-stats.py\n' > /etc/cron.d/engenui-stats
cat > /etc/logrotate.d/engenui-ping <<'CONF'
/var/log/engenui/ping.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    sharedscripts
    postrotate
        [ -f /run/nginx.pid ] && kill -USR1 $(cat /run/nginx.pid)
    endscript
}
CONF
systemctl reload nginx
/usr/bin/python3 /usr/local/bin/engenui-stats.py
echo "page statistics installed: https://freshbubbles.pt/test/pagestats"
