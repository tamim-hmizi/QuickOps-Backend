const express = require("express");
const { protect } = require("../middleware/auth");
const router = express.Router();
const {
  deployProject,
  getFullLog,
} = require("../controllers/deployController");

router.post("/deploy", protect, deployProject);
router.get("/logs/full/:jobName/:buildId", protect, getFullLog);


module.exports = router;
