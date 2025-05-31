const projectService = require("../services/projectService");
const deployService = require("../services/deployService");
const jenkinsService = require("../services/jenkinsService");

const deployProject = async (req, res) => {
  try {
    const { id } = req.body;

    const project = await projectService.getProjectById(id);
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
  try {
    const log = await jenkinsService.getBuildLog(jobName, buildId);
    res.send({ log });
  } catch (err) {
    console.error("Failed to fetch full log:", err.message);
    res.status(500).json({ log: "Error fetching full log" });
  }
};

module.exports = { deployProject, getFullLog };
