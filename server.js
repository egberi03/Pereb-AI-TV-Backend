const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const RATE = Number(process.env.VIEW_RATE) || 0.50;

// IMPORTANT: Render's filesystem is ephemeral on Free services.
// This MVP uses local JSON/files for now. Use a persistent DB/object storage for production.
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadDir));

const dbFile = path.join(__dirname, "data.json");

function loadDb() {
  try {
    if (!fs.existsSync(dbFile)) return { users: [], videos: [] };
    const parsed = JSON.parse(fs.readFileSync(dbFile, "utf8"));
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      videos: Array.isArray(parsed.videos) ? parsed.videos : []
    };
  } catch (err) {
    console.error("Could not read data.json:", err.message);
    return { users: [], videos: [] };
  }
}

let db = loadDb();

function save() {
  const tmp = `${dbFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbFile);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Lightweight MVP bearer-token store.
// For production, replace with a proper JWT/session system and persistent user store.
const sessions = new Map();

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
}

function authRequired(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const session = sessions.get(token);

  if (!session) return res.status(401).json({ error: "Authentication required" });

  const user = db.users.find(u => u.id === session.userId);
  if (!user) {
    sessions.delete(token);
    return res.status(401).json({ error: "User not found" });
  }

  req.user = user;
  req.token = token;
  next();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("video/")) {
      return cb(null, true);
    }
    cb(new Error("Only video files are allowed"));
  }
});

// ---- Basic service routes ----

app.get("/", (req, res) => {
  res.json({
    service: "PerebAI TV API",
    status: "ok",
    message: "Backend is connected",
    endpoints: {
      health: "/health",
      videos: "/videos",
      login: "POST /api/auth/login",
      register: "POST /api/auth/register",
      dashboard: "/dashboard"
    }
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "PerebAI TV",
    timestamp: new Date().toISOString()
  });
});

// ---- Authentication ----
// POST /api/auth/register
// JSON: { "email": "...", "password": "...", "name": "..." }

app.post("/api/auth/register", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const name = String(req.body?.name || email.split("@")[0] || "").trim();

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (db.users.some(u => u.email === email)) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const { salt, hash } = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    email,
    name: name || "Creator",
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  save();

  const token = createSession(user.id);

  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name }
  });
});

// POST /api/auth/login
// JSON: { "email": "...", "password": "..." }

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = db.users.find(u => u.email === email);
  if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = createSession(user.id);

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name }
  });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name
    }
  });
});

app.post("/api/auth/logout", authRequired, (req, res) => {
  sessions.delete(req.token);
  res.json({ message: "Logged out" });
});

// ---- Videos ----

app.get("/videos", (req, res) => {
  const origin = `${req.protocol}://${req.get("host")}`;
  const videos = db.videos.slice().reverse().map(v => ({
    ...v,
    videoUrl: v.videoUrl.startsWith("http") ? v.videoUrl : origin + v.videoUrl
  }));
  res.json(videos);
});

app.post("/videos/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Video file is required" });
  }

  const video = {
    id: crypto.randomUUID(),
    title: String(req.body?.title || "").trim(),
    description: String(req.body?.description || "").trim(),
    creator: String(req.body?.creator || "").trim(),
    videoUrl: "/uploads/" + req.file.filename,
    views: 0,
    earnings: 0,
    createdAt: new Date().toISOString()
  };

  if (!video.title || !video.creator) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).json({ error: "Title and creator are required" });
  }

  db.videos.push(video);
  save();

  const origin = `${req.protocol}://${req.get("host")}`;
  res.status(201).json({
    ...video,
    videoUrl: origin + video.videoUrl
  });
});

app.post("/videos/:id/view", (req, res) => {
  const video = db.videos.find(v => v.id === req.params.id);

  if (!video) {
    return res.status(404).json({ error: "Video not found" });
  }

  video.views += 1;
  video.earnings = Number((video.views * RATE).toFixed(2));
  save();

  res.json({ views: video.views, earnings: video.earnings });
});

app.get("/api/dashboard", (req, res) => {
  const totalViews = db.videos.reduce((n, v) => n + Number(v.views || 0), 0);
  const totalVideos = db.videos.length;

  res.json({
    totalViews,
    totalVideos,
    earnings: Number((totalViews * RATE).toFixed(2)),
    rate: RATE
  });
});

// ---- Error handling ----

app.use((err, req, res, next) => {
  console.error(err);

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Video exceeds the 250 MB limit" });
    }
    return res.status(400).json({ error: err.message });
  }

  res.status(400).json({ error: err.message || "Request failed" });
});

// 404 JSON instead of Render/Express HTML.
// This makes frontend fetch() errors much easier to diagnose.
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    method: req.method,
    path: req.originalUrl
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PerebAI TV API running on port ${PORT}`);
});
