const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const projectRoutes = require("./routes/projectRoutes");
const deployRoutes = require("./routes/deployRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use("/api", projectRoutes);
app.use("/api", deployRoutes);
app.use("/api/auth", authRoutes);

module.exports = app;
