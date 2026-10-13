require("dotenv").config();

const dns = require("dns");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const port = Number(process.env.PORT || 8000);
const mongoUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;
let databaseReady;

if (!mongoUri || !jwtSecret) {
  console.error("MONGODB_URI and JWT_SECRET must be set in .env");
  process.exit(1);
}

// Atlas uses SRV records. Some local routers refuse these lookups, so use
// public resolvers for this process without changing the machine's settings.
dns.setServers(["1.1.1.1", "8.8.8.8"]);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true }));

const stateSchema = new mongoose.Schema({
  isPunishmentMode: Boolean,
  completedRoutineIds: [String],
  matrixData: mongoose.Schema.Types.Mixed,
  sleepData: mongoose.Schema.Types.Mixed,
  exerciseStatus: mongoose.Schema.Types.Mixed,
  currentWater: Number,
  targetWater: Number,
  waterIntervalMins: Number,
  isWaterReminderEnabled: Boolean,
  customReminders: [mongoose.Schema.Types.Mixed],
  notes: { type: String, maxlength: 10000 }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  state: { type: stateSchema, default: () => ({}) }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

async function connectDatabase() {
  if (!databaseReady) {
    databaseReady = mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    }).then(() => User.createCollection().catch((error) => {
      if (error.codeName !== "NamespaceExists") throw error;
    }));
  }
  return databaseReady;
}

app.use("/api", async (req, res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

function createToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, jwtSecret, { expiresIn: "7d" });
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    req.userId = jwt.verify(token, jwtSecret).sub;
    next();
  } catch {
    res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email };
}

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 8) {
      return res.status(400).json({ error: "Name, email, and a password of at least 8 characters are required." });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ error: "An account with this email already exists." });
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12)
    });
    res.status(201).json({ token: createToken(user), user: publicUser(user), state: user.state });
  } catch (error) { next(error); }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const user = await User.findOne({ email: String(req.body.email || "").trim().toLowerCase() });
    if (!user || !(await bcrypt.compare(String(req.body.password || ""), user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    res.json({ token: createToken(user), user: publicUser(user), state: user.state });
  } catch (error) { next(error); }
});

app.get("/api/auth/me", auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("name email state");
    if (!user) return res.status(401).json({ error: "Account not found." });
    res.json({ user: publicUser(user), state: user.state });
  } catch (error) { next(error); }
});

app.put("/api/state", auth, async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.userId, { $set: { state: req.body } }, { new: true, runValidators: true }).select("state");
    if (!user) return res.status(404).json({ error: "Account not found." });
    res.json({ state: user.state });
  } catch (error) { next(error); }
});

app.get("/api/health", (req, res) => res.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "connecting" }));
app.use(express.static(path.join(__dirname)));
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

connectDatabase().then(() => {
  if (process.env.NETLIFY !== "true") {
    app.listen(port, () => console.log(`Winter Arc running at http://localhost:${port}`));
  }
}).catch((error) => {
  if (error.code === "ECONNREFUSED" && error.syscall === "querySrv") {
    console.error(
      "Your MongoDB URI hostname is valid, but the configured DNS server refused the SRV lookup. " +
      "Set your network adapter DNS to 1.1.1.1 or 8.8.8.8, then restart the server."
    );
  } else {
    console.error("MongoDB connection failed:", error.message);
  }
  process.exit(1);
});

module.exports = app;
