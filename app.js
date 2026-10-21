const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const projectRoutes = require("./routes/projectRoutes");
const deployRoutes = require("./routes/deployRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Behind a reverse proxy, use the client IP from X-Forwarded-For.
app.set("trust proxy", 1);
app.use(
  "/api",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false })
);
// Stricter limit on login and registration to slow down password guessing.
app.use(
  "/api/auth",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false })
);

app.use("/api", projectRoutes);
app.use("/api", deployRoutes);
app.use("/api/auth", authRoutes);

module.exports = app;
