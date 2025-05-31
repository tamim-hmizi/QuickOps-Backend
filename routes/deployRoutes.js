const express = require("express");
const router = express.Router();
const {
  deployProject,
  getFullLog,
} = require("../controllers/deployController");

router.post("/deploy", deployProject);
router.get("/logs/full/:jobName/:buildId", getFullLog);


module.exports = router;
