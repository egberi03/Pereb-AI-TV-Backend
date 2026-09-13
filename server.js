const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const RATE = Number(process.env.VIEW_RATE || 0.50);
const APP_VERSION = process.env.APP_VERSION || "2.0.0";
const FRONTEND_URL = process.env.FRONTEND_URL || "*";
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const dbFile = path.join(__dirname, "data.json");
function loadDb() {
  try {
    if (!fs.existsSync(dbFile)) return { videos: [] };
    const parsed = JSON.parse(fs.readFileSync(dbFile, "utf8"));
    return parsed && Array.isArray(parsed.videos) ? parsed : { videos: [] };
  } catch (err) {
    console.error("Database read error:", err.message);
    return { videos: [] };
  }
}
let db = loadDb();
function save() {
  const tmp = dbFile + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbFile);
}

const allowedOrigins = FRONTEND_URL === "*"
  ? true
  : FRONTEND_URL.split(",").map(v => v.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type"] }));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadDir, { maxAge: "1h" }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".mp4";
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("video/")) return cb(null, true);
    cb(new Error("Only video files are allowed"));
  }
});

function videoUrlFor(req, filename) {
  const base = PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
  return `${base}/uploads/${encodeURIComponent(filename)}`;
}

app.get("/", (_req, res) => {
  res.json({ service: "PerebAI TV API", status: "online", version: APP_VERSION });
});

app.get("/api", (_req, res) => {
  res.json({ service: "PerebAI TV API", status: "online", version: APP_VERSION });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "PerebAI TV",
    version: APP_VERSION,
    routes: ["GET /api/videos", "POST /api/videos/upload", "POST /api/videos/:id/view", "GET /api/dashboard"]
  });
});

app.get("/api/videos", (_req, res) => {
  res.json(db.videos.slice().reverse());
});

app.post("/api/videos/upload", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Video file is required" });

  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const creator = String(req.body.creator || "").trim();

  if (!title || !creator) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: "Title and creator are required" });
  }

  const video = {
    id: crypto.randomUUID(),
    title,
    description,
    creator,
    videoUrl: videoUrlFor(req, req.file.filename),
    views: 0,
    earnings: 0,
    createdAt: new Date().toISOString()
  };
  db.videos.push(video);
if (video.videoUrl && video.videoUrl.startsWith("/")) {
  video.videoUrl = `https://${req.get("host")}${video.videoUrl}`;
}

save();

res.status(201).json(video);
});

app.post("/api/videos/:id/view", (req, res) => {
  const video = db.videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: "Video not found" });
  video.views += 1;
  video.earnings = Number((video.views * RATE).toFixed(2));
  save();
  res.json({ views: video.views, earnings: video.earnings });
});

app.get("/api/dashboard", (_req, res) => {
  const totalViews = db.videos.reduce((n, v) => n + Number(v.views || 0), 0);
  const totalVideos = db.videos.length;
  res.json({ totalViews, totalVideos, earnings: Number((totalViews * RATE).toFixed(2)), rate: RATE });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const message = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
    ? "Video is too large. Maximum size is 250 MB."
    : err.message || "Request failed";
  res.status(400).json({ error: message });
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found", method: req.method, path: req.path });
});

app.listen(PORT, () => {
  console.log(`PerebAI TV API v${APP_VERSION} running on port ${PORT}`);
});
