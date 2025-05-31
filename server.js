const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const connectDB = require("./config/db");
const dotenv = require("dotenv");
const projectRoutes = require("./routes/projectRoutes");
const deployRoutes = require("./routes/deployRoutes");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(bodyParser.json());

connectDB();
app.use("/api", projectRoutes);
app.use("/api", deployRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
