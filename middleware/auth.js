const jwt = require("jsonwebtoken");

const TOKEN_TTL = "8h";

const signToken = (userId) =>
  jwt.sign({ id: userId.toString() }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });

// Verifies the Bearer token issued at login and exposes the user id.
const protect = (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ success: false, message: "Not authorized, no token" });
  }
  try {
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id };
    next();
  } catch {
    res.status(401).json({ success: false, message: "Not authorized, invalid token" });
  }
};

module.exports = { protect, signToken };
