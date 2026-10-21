const mongoose = require("mongoose");
const projectService = require("../services/projectService");
const deployService = require("../services/deployService");
const jenkinsService = require("../services/jenkinsService");

const deployProject = async (req, res) => {
  try {
    const { id } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    const project = await projectService.getProjectWithToken(req.user.id, id);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    if (!project.deploymentChoice) {
      return res
        .status(400)
        .json({ success: false, message: "Deployment choice not set" });
    }

    const result = await deployService.triggerPipeline(project);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("❌ Error in deployProject controller:", err.stack || err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getFullLog = async (req, res) => {
  const { jobName, buildId } = req.params;
  // Jenkins jobs are named after projects, so only their owner may read the logs.
  if (!(await projectService.ownsProjectNamed(req.user.id, jobName))) {
    return res.status(404).json({ log: "Not found" });
  }
  try {
    const log = await jenkinsService.getBuildLog(jobName, buildId);
    res.send({ log });
  } catch (err) {
    console.error("Failed to fetch full log:", err.message);
    res.status(500).json({ log: "Error fetching full log" });
  }
};

module.exports = { deployProject, getFullLog };
