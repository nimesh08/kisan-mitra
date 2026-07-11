#!/usr/bin/env bash
# =============================================================================
# Kisan Mitra — one-shot EC2 provisioning (Ubuntu 22.04/24.04).
#
# Installs Node 20 + Caddy, clones the repo, writes .env, sets up a systemd
# service, and configures Caddy for automatic HTTPS + WebSocket.
#
# Usage (on the EC2 box, as the `ubuntu` user):
#   export DOMAIN="kisanmitra.duckdns.org"        # a domain pointing to this EC2's public IP
#   export GEMINI_API_KEY="your-key"
#   curl -fsSL https://raw.githubusercontent.com/nimesh08/kisan-mitra/main/deploy/setup.sh | bash
# or:
#   DOMAIN=... GEMINI_API_KEY=... bash deploy/setup.sh
# =============================================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/nimesh08/kisan-mitra.git}"
APP_DIR="${APP_DIR:-/home/ubuntu/kisan-mitra}"
: "${DOMAIN:?Set DOMAIN (a hostname pointing at this server's public IP, e.g. kisanmitra.duckdns.org)}"
: "${GEMINI_API_KEY:?Set GEMINI_API_KEY}"

echo "==> [1/6] System packages"
sudo apt-get update -y
sudo apt-get install -y curl git ca-certificates

echo "==> [2/6] Node.js 20"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node --version

echo "==> [3/6] Caddy (automatic HTTPS reverse proxy)"
if ! command -v caddy >/dev/null 2>&1; then
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi

echo "==> [4/6] Get the code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
npm install --omit=dev

echo "==> [5/6] Write .env + systemd service"
cat > "$APP_DIR/.env" <<EOF
GEMINI_API_KEY=$GEMINI_API_KEY
PORT=8080
LIVE_MODEL=models/gemini-3.1-flash-live-preview
MAX_SESSIONS=8
SOFT_LIMIT_MS=120000
HARD_LIMIT_MS=150000
EOF
chmod 600 "$APP_DIR/.env"

sudo cp "$APP_DIR/deploy/kisan-mitra.service" /etc/systemd/system/kisan-mitra.service
sudo systemctl daemon-reload
sudo systemctl enable --now kisan-mitra
sudo systemctl restart kisan-mitra

echo "==> [6/6] Configure Caddy for $DOMAIN"
sudo mkdir -p /etc/caddy
echo "$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
}" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl restart caddy

echo ""
echo "============================================================"
echo " Kisan Mitra is live:  https://$DOMAIN"
echo "   app service:  sudo systemctl status kisan-mitra"
echo "   app logs:     sudo journalctl -u kisan-mitra -f"
echo "   caddy logs:   sudo journalctl -u caddy -f"
echo "============================================================"
