# 🚀 Deploy Kisan Mitra on AWS EC2 (for judges)

This guide takes a fresh EC2 instance to a public **HTTPS** URL that judges can open
on their phones and immediately start a live crop-doctor call.

---

## Why this architecture (read first)

```
   Judge's phone (browser)
        │  HTTPS + WSS  (camera + mic REQUIRE a secure origin)
        ▼
   ┌──────────────── EC2 (Ubuntu) ────────────────┐
   │  Caddy :443  ── automatic Let's Encrypt cert  │
   │     │  reverse_proxy + WebSocket upgrade      │
   │     ▼                                         │
   │  Node relay :8080 (localhost only)            │
   │     • stateless, 1 Gemini session per caller  │
   │     • serves the PWA + runs the 5 tools        │
   └───────────────────┬───────────────────────────┘
                        │  WSS
                        ▼
        Gemini Live API (gemini-3.1-flash-live-preview)
```

**The one hard requirement: HTTPS.** Browsers block `getUserMedia` (camera/mic) unless
the page is served over HTTPS (or `localhost`). So we put **Caddy** in front — it fetches
a real certificate automatically and transparently proxies the `/live` WebSocket to the
Node app. The Node app only listens on `localhost:8080`; only Caddy is exposed (80/443).

Caddy needs a **domain name** to get a certificate (Let's Encrypt won't issue for raw
`ec2-…amazonaws.com` hosts). A free **DuckDNS** subdomain works perfectly.

---

## Prerequisites
- An AWS account and your `GEMINI_API_KEY`.
- 5 minutes.

---

## Step 1 — Launch the EC2 instance
1. EC2 → **Launch instance**.
2. **Name:** `kisan-mitra`
3. **AMI:** Ubuntu Server 24.04 LTS (or 22.04).
4. **Instance type:** `t3.small` (2 vCPU / 2 GB — comfortable for the relay; `t3.micro` also works).
5. **Region:** `ap-south-1` (Mumbai) for lowest latency to India-based judges.
6. **Key pair:** create/download one (for SSH).
7. **Network / Security group — add inbound rules:**
   | Type | Port | Source | Why |
   |------|------|--------|-----|
   | SSH | 22 | My IP | admin |
   | HTTP | 80 | 0.0.0.0/0 | Let's Encrypt challenge + redirect |
   | HTTPS | 443 | 0.0.0.0/0 | the app |
   Do **NOT** open 8080 — the app stays private behind Caddy.
8. Launch. Note the **public IPv4 address**.

## Step 2 — Point a free domain at the instance
1. Go to **https://www.duckdns.org**, sign in, create a subdomain e.g. `kisanmitra`.
2. Set its IP to your EC2 **public IPv4**. You now have `kisanmitra.duckdns.org`.
   *(Any domain works — just make an A record → EC2 IP.)*

## Step 3 — Provision (one command)
SSH in and run the setup script:
```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>

export DOMAIN="kisanmitra.duckdns.org"
export GEMINI_API_KEY="paste-your-key-here"
curl -fsSL https://raw.githubusercontent.com/nimesh08/kisan-mitra/main/deploy/setup.sh | bash
```
The script installs Node 20 + Caddy, clones the repo, writes `.env`, starts the app as a
systemd service, and configures Caddy. When it prints `Kisan Mitra is live`, you're done.

## Step 4 — Demo
Open **https://kisanmitra.duckdns.org** on a phone → tap **Start Crop Call** → allow
camera + mic → point at a crop and speak in any language.

---

## Manual steps (if you prefer not to use the script)
```bash
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
# Code
git clone https://github.com/nimesh08/kisan-mitra.git && cd kisan-mitra && npm install --omit=dev
# Env
printf 'GEMINI_API_KEY=YOUR_KEY\nPORT=8080\nLIVE_MODEL=models/gemini-3.1-flash-live-preview\nMAX_SESSIONS=8\n' > .env && chmod 600 .env
# Service
sudo cp deploy/kisan-mitra.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now kisan-mitra
# Caddy
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
echo 'kisanmitra.duckdns.org {
	reverse_proxy 127.0.0.1:8080
}' | sudo tee /etc/caddy/Caddyfile && sudo systemctl restart caddy
```

---

## Operating it
```bash
sudo systemctl status kisan-mitra      # is the app up?
sudo journalctl -u kisan-mitra -f      # live app logs (per-call, tool calls)
sudo journalctl -u caddy -f            # TLS / proxy logs
# update to latest code:
cd ~/kisan-mitra && git pull && npm install --omit=dev && sudo systemctl restart kisan-mitra
```

Health check: `curl https://kisanmitra.duckdns.org/health` → `{"status":"ok",...}`.

---

## Alternative: no domain, no EC2 ports — Cloudflare Tunnel
If you can't open a domain/ports, run the app and expose it with a Cloudflare tunnel
(gives an instant HTTPS URL):
```bash
npm start &                                   # app on :8080
# install cloudflared, then:
cloudflared tunnel --url http://localhost:8080
```
It prints a `https://<random>.trycloudflare.com` URL — WebSocket-capable, works for the demo.

---

## Troubleshooting
| Symptom | Fix |
|---|---|
| Camera/mic won't start | You must use the **https://** URL, not the IP. Confirm the cert issued (`journalctl -u caddy`). |
| Cert not issuing | Port **80** must be open to the world; DNS A record must point to this EC2 IP; wait ~30s. |
| "All lines busy" | Concurrent calls hit `MAX_SESSIONS` (default 8). Raise it in `.env` + `systemctl restart kisan-mitra`. |
| Call connects then drops | Check app logs; verify `GEMINI_API_KEY` is valid in `.env`. |
| WebSocket fails | Ensure you're going through Caddy (443), not `:8080` directly. |

## Cost & security
- `t3.small` ≈ a few cents/hour — **stop the instance after judging** to avoid charges.
- The API key lives only in `/home/ubuntu/kisan-mitra/.env` (chmod 600), never in git.
- Only 22/80/443 are exposed; the Node app is localhost-only behind Caddy.
