# A Little Coffee (珈琲の小時間 · 咖啡小记录)

A minimalist, zero-dependency coffee tasting journal and SCA cupping web application built with Node.js 22 (native SQLite) and Docker.

Supports **Daily Coffee Brew Logging** (across 3 temperature stages), **Multi-Cup SCA Comparative Cupping**, a **1–10 International Sensory & Rebuy Recommendation Scale**, **Community Tasting Feed (Home)**, **Japanese / Chinese / English** instant switching, **Cloudflare Tunnel**, and automated **CI/CD via GitHub Actions + GHCR + Watchtower**.

---

## Key Features

1. **Three Main Sections**
   - **Home (`ホーム` / `Home`)**: Community tasting feed aggregating shared Daily Brew logs and Cupping sessions from you and your friends. Unauthenticated visitors can browse shared records in read-only mode (author names are partially masked with `*` until logged in).
   - **Daily (`毎日の記録` / `每日咖啡` / `Daily`)**: Fast 30-second single-page log for your daily cup of coffee. Includes 1-click autofill from recent beans, 10 brew methods, grind & ratio presets, 3 temperature stages (`Hot ~70°C`, `Warm ~50°C`, `Room ~35°C`) rated on a 1–10 scale, automated extraction tuning tips, and a **1–10 Recommendation / Rebuy Score**.
   - **Cupping (`カッピング` / `Cupping`)**: 3–5 cup comparative blind/open SCA cupping workflow with a 4-minute steep timer, audio alert, 5-stage aroma evolution bar chart, and multi-cup radar overlays.
2. **Minimalist Editorial Design & Tri-Lingual UI**
   - Clean, distraction-free typography with zero decorative icon clutter.
   - Instant language toggle (`日本語 | 中文 | EN`), defaulting to Japanese (`日本語`).
   - Built-in collapsible reference guides inside both **Daily** and **Cupping** sections.
3. **Hidden Admin URI (`/admin`)**
   - No admin link is exposed in the public navigation bar. Administrators access user/invite management and SQLite database snapshot downloads directly via `/admin` or `/#admin`.
4. **Standalone Single-File Offline Edition Included**
   - `cupping_standalone.html` is included in the repository root and runs 100% offline in any browser using `localStorage`.

---

## Default Administrator Account

On first startup, the server automatically seeds the default administrator account:
- **Username**: `admin`
- **Password**: `ineedacupofcoffee`
- **Admin Console URL**: `http://<server-ip>:3000/admin` (or `https://<your-domain>/admin`)

> You can change the administrator password anytime under **Settings** in the top-right menu, or override `ADMIN_USER` and `ADMIN_PASS` via `.env`.

---

## CI/CD Architecture & Automated NAS Deployment

This repository includes an automated CI/CD pipeline ([`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml)):

1. **Continuous Integration (GitHub Actions $\rightarrow$ GHCR)**:
   - Every `git push` to `main` (or tag `v*`) automatically triggers GitHub Actions.
   - Builds a multi-architecture Docker image (`linux/amd64` and `linux/arm64`) and publishes it to GitHub Container Registry:
     `ghcr.io/yooshinn2024/coffee_cupping:latest`
2. **Continuous Deployment (Home Debian NAS)**:
   - Your Debian NAS runs `docker-compose.yml` with the `watchtower` service (`autodeploy` profile).
   - Watchtower monitors `ghcr.io/yooshinn2024/coffee_cupping:latest`, automatically pulls new images as soon as a GitHub Actions build completes, and gracefully restarts the `coffee-cupping` container while preserving `./data`.

---

## Deployment on Debian NAS (Docker Compose + Cloudflare Tunnel)

### Step 1: Make the GHCR Package Public (One-Time Setup on GitHub)
So your NAS can pull `ghcr.io/yooshinn2024/coffee_cupping:latest` without needing a GitHub token:
1. Open your GitHub repository $\rightarrow$ click **Packages** on the right sidebar (`coffee_cupping`).
2. Click **Package settings** (bottom right) $\rightarrow$ scroll to **Danger Zone** $\rightarrow$ **Change visibility** $\rightarrow$ select **Public** (or run `docker login ghcr.io` on your NAS if you prefer keeping the image private).

### Step 2: Create a Cloudflare Tunnel Token
1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/) $\rightarrow$ **Networks** $\rightarrow$ **Tunnels**.
2. Click **Create a tunnel** $\rightarrow$ select **Cloudflared** $\rightarrow$ name it (e.g., `coffee-note`).
3. Copy the token string (`eyJ...`) shown after `--token`.
4. Under **Public Hostname**, add a hostname:
   - **Subdomain**: e.g., `coffee`
   - **Domain**: your Cloudflare domain
   - **Service Type**: `HTTP`
   - **URL**: `app:3000` (uses the internal Docker network directly)

### Step 3: Start on Your Debian NAS
```bash
git clone https://github.com/yooshinn2024/coffee_cupping.git
cd coffee_cupping
cp .env.example .env
nano .env
```

Edit `.env`:
```ini
TUNNEL_TOKEN=eyJhIjoi...your_cloudflare_tunnel_token...
COMPOSE_PROFILES=tunnel,autodeploy

ADMIN_USER=admin
ADMIN_PASS=ineedacupofcoffee

PUID=1000
PGID=1000
TZ=Asia/Tokyo
```

Start the stack (pulls the prebuilt image from GHCR and starts the app, Cloudflare Tunnel, and Watchtower auto-updater):
```bash
docker compose pull
docker compose up -d
```

### Manual Update Trigger (Anytime)
If you want to pull and deploy a new image immediately without waiting for Watchtower's 5-minute polling interval:
```bash
cd coffee_cupping
docker compose pull && docker compose up -d
```
