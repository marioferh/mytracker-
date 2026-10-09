# Private Time

Personal time tracker with two ways to run it:

| Mode | Path | Storage |
|------|------|---------|
| **Static (GitHub Pages)** | [`index.html`](index.html) at repo root | Browser `localStorage` |
| **Server / Docker** | [`docker/`](docker/) | JSON file on the server |

## Static page (default)

Open [`index.html`](index.html) locally, or use GitHub Pages:

https://marioferh.github.io/private-time-tracker/

Data stays in that browser. Use **Export** / **Import** for backups or to move data to the server version.

## Server / Docker

Files live under [`docker/`](docker/).

```bash
cd docker
cp .env.example .env
# set APP_PASSWORD=...

# with Docker
docker compose up -d --build
# open http://SERVER_IP:3000

# or without Docker (Node 20+)
mkdir -p data
set -a; source .env; set +a
DATA_DIR=./data PORT=3000 node server.js
```

Sign in with `APP_PASSWORD`. Data is stored in `/data/db.json` (Docker volume) or `docker/data/db.json` (bare Node).

### Migrate from the static page

1. On GitHub Pages (or the static file): **Export** → `time-backup.json`
2. On the server app: sign in → **Import** that file

### Notes

- Password over plain HTTP is fine on a trusted LAN / Tailscale. Use HTTPS if exposed publicly.
- Docker needs access to Docker Hub to build (`node:20-alpine`). If the host cannot pull images, use the Node binary approach above.
