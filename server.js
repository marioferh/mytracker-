"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const APP_PASSWORD = process.env.APP_PASSWORD;
const COOKIE_NAME = "ptt_auth";
const DEFAULT_CATEGORIES = ["work", "read", "sport", "play", "free"];
const STATIC_ROOT = __dirname;

if (!APP_PASSWORD) {
  console.error("APP_PASSWORD is required");
  process.exit(1);
}

function defaultDb() {
  return {
    categories: DEFAULT_CATEGORIES.slice(),
    sessions: [],
    active: null,
    colors: {},
  };
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readDb() {
  ensureDataDir();
  if (!fs.existsSync(DB_PATH)) {
    const db = defaultDb();
    writeDb(db);
    return db;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    if (!raw || !Array.isArray(raw.categories) || !Array.isArray(raw.sessions)) {
      throw new Error("invalid shape");
    }
    if (!raw.active) raw.active = null;
    if (!raw.colors || typeof raw.colors !== "object") raw.colors = {};
    if (raw.categories.length === 0) raw.categories = DEFAULT_CATEGORIES.slice();
    return raw;
  } catch (err) {
    console.error("Failed to read db, resetting to defaults:", err.message);
    const db = defaultDb();
    writeDb(db);
    return db;
  }
}

function writeDb(db) {
  ensureDataDir();
  const tmp = DB_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function isValidDb(x) {
  return x && Array.isArray(x.categories) && Array.isArray(x.sessions);
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function authToken() {
  return crypto
    .createHmac("sha256", APP_PASSWORD)
    .update("private-time-tracker-session")
    .digest("hex");
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  String(header)
    .split(";")
    .forEach((part) => {
      const i = part.indexOf("=");
      if (i === -1) return;
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    });
  return out;
}

function isAuthed(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return false;
  try {
    return safeEqual(token, authToken());
  } catch {
    return false;
  }
}

function sendJson(res, status, body, extraHeaders) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    ...(extraHeaders || {}),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const max = 5 * 1024 * 1024;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > max) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

function serveStatic(req, res, urlPath) {
  let rel = urlPath === "/" ? "/index.html" : urlPath;
  rel = decodeURIComponent(rel);
  if (rel.includes("\0") || rel.includes("..")) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  const filePath = path.join(STATIC_ROOT, rel);
  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(data);
  });
}

function authCookieHeader() {
  const maxAge = 60 * 60 * 24 * 365;
  return `${COOKIE_NAME}=${encodeURIComponent(authToken())}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookieHeader() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/session") {
    sendJson(res, 200, { authenticated: isAuthed(req) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    let body;
    try {
      body = await readJson(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON" });
      return;
    }
    const password = body?.password;
    if (typeof password !== "string" || !safeEqual(password, APP_PASSWORD)) {
      sendJson(res, 401, { error: "Invalid password" });
      return;
    }
    sendJson(res, 200, { ok: true }, { "Set-Cookie": authCookieHeader() });
    return;
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    sendJson(res, 200, { ok: true }, { "Set-Cookie": clearCookieHeader() });
    return;
  }

  if (req.method === "GET" && pathname === "/api/data") {
    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }
    sendJson(res, 200, readDb());
    return;
  }

  if (req.method === "PUT" && pathname === "/api/data") {
    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }
    let x;
    try {
      x = await readJson(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON" });
      return;
    }
    if (!isValidDb(x)) {
      sendJson(res, 400, { error: "Invalid data" });
      return;
    }
    const db = {
      categories: x.categories,
      sessions: x.sessions,
      active: x.active || null,
      colors: x.colors && typeof x.colors === "object" ? x.colors : {},
    };
    if (db.categories.length === 0) db.categories = DEFAULT_CATEGORIES.slice();
    writeDb(db);
    sendJson(res, 200, db);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end("Method not allowed");
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: "Server error" });
  }
});

ensureDataDir();
if (!fs.existsSync(DB_PATH)) writeDb(defaultDb());

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Private Time listening on http://0.0.0.0:${PORT}`);
  console.log(`Data file: ${DB_PATH}`);
});
