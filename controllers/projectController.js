const projectService = require("../services/projectService");

const createProject = async (req, res) => {
  const { name, frontendRepo, backendRepos, githubToken } = req.body;

  try {
    if (!name || !frontendRepo || !backendRepos || !githubToken) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const project = await projectService.createProject({
      name,
      frontendRepo,
      backendRepos,
      githubToken,
    });

    res.status(201).json({ success: true, project });
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateProject = async (req, res) => {
  const { id } = req.params;
  const {
    status,
    recommendation,
    reasoning, // <-- added
    deploymentChoice,
    publicIp,
    dnsLabel,
  } = req.body;

  try {
    const updateData = {};

    if (status) updateData.status = status;
    if (recommendation) updateData.recommendation = recommendation;
    if (reasoning) updateData.reasoning = reasoning; // <-- added
    if (deploymentChoice) updateData.deploymentChoice = deploymentChoice;
    if (publicIp) updateData.publicIp = publicIp;
    if (dnsLabel) updateData.dnsLabel = dnsLabel;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
    }

    const updatedProject = await projectService.updateProject(id, updateData);

    if (!updatedProject) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    res.status(200).json({ success: true, updatedProject });
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


const deleteProject = async (req, res) => {
  const { id } = req.params;

  try {
    const project = await projectService.getProjectById(id);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    if (project.status === "deployed") {
      return res.status(400).json({
        success: false,
        message: "Deployed projects cannot be deleted",
      });
    }

    await projectService.deleteProject(id);
    res
      .status(200)
      .json({ success: true, message: "Project deleted successfully" });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllProjects = async (req, res) => {
  try {
    const projects = await projectService.getAllProjects();
    res.status(200).json({ success: true, projects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getProjectById = async (req, res) => {
  const { id } = req.params;
  try {
    const project = await projectService.getProjectById(id);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }
    res.status(200).json({ success: true, project });
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createProject,
  updateProject,
  deleteProject,
  getAllProjects,
  getProjectById,
};
