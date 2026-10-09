# Private Time

Single-user time tracker. A small Node server (no npm dependencies) serves the UI and stores data as JSON on disk.

## Run with Docker (recommended)

```bash
cp .env.example .env
# edit .env and set APP_PASSWORD

docker compose up -d --build
```

Open `http://SERVER_IP:3000`, sign in with `APP_PASSWORD`.

Data persists in the Docker volume `tracker_data` (`/data/db.json` inside the container). Restarts keep your sessions.

### One-time migration from browser localStorage

If you already tracked time in the old local-only page:

1. Open the old page and use **Export** to download `time-backup.json`.
2. Deploy this server and sign in.
3. Use **Import** and select that file. Data is written to the server.

### Notes

- Export/Import remain available as a local backup.
- Password over plain HTTP is fine on a trusted LAN. For the public internet, put HTTPS (reverse proxy) in front.
- Sign out clears the auth cookie on this browser.

## Run without Docker

Needs Node 20+.

```bash
cp .env.example .env
# set APP_PASSWORD
APP_PASSWORD=your-password npm start
# or: APP_PASSWORD=your-password node server.js
```

Optional: `PORT=3000` and `DATA_DIR=./data`.
