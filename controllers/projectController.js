const mongoose = require("mongoose");
const axios = require("axios");
const projectService = require("../services/projectService");

const isId = (id) => mongoose.Types.ObjectId.isValid(id);
const notFound = (res) => res.status(404).json({ success: false, message: "Project not found" });

const createProject = async (req, res) => {
  const { name, frontendRepo, backendRepos, githubToken } = req.body;

  try {
    if (!name || !frontendRepo || !backendRepos || !githubToken) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const project = await projectService.createProject(req.user.id, {
      name,
      frontendRepo,
      backendRepos,
      githubToken,
    });

    res.status(201).json({ success: true, project });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "A project with this name already exists." });
    }
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

  if (!isId(id)) return notFound(res);

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

    const updatedProject = await projectService.updateProject(req.user.id, id, updateData);

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
  if (!isId(id)) return notFound(res);

  try {
    const project = await projectService.getProjectById(req.user.id, id);
    if (!project) return notFound(res);

    if (project.status === "deployed") {
      return res.status(400).json({
        success: false,
        message: "Deployed projects cannot be deleted",
      });
    }

    await projectService.deleteProject(req.user.id, id);
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
    const projects = await projectService.getAllProjects(req.user.id);
    res.status(200).json({ success: true, projects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getProjectById = async (req, res) => {
  const { id } = req.params;
  if (!isId(id)) return notFound(res);
  try {
    const project = await projectService.getProjectById(req.user.id, id);
    if (!project) return notFound(res);
    res.status(200).json({ success: true, project });
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Asks QuickOps-AI for a VM or Kubernetes recommendation. Runs on the server so
// the stored GitHub token never reaches the browser.
const analyzeProject = async (req, res) => {
  const { id } = req.params;
  if (!isId(id)) return notFound(res);

  try {
    const project = await projectService.getProjectWithToken(req.user.id, id);
    if (!project) return notFound(res);

    const aiUrl = (process.env.AI_URL || "http://localhost:8001").replace(/\/+$/, "");
    const { data } = await axios.post(
      `${aiUrl}/suggest`,
      {
        frontend: project.frontendRepo,
        backends: project.backendRepos,
        token: project.githubToken,
      },
      { timeout: 300000 }
    );

    const updatedProject = await projectService.updateProject(req.user.id, id, {
      recommendation: data.recommendation,
      reasoning: data.reasoning,
    });
    res.status(200).json({ success: true, updatedProject });
  } catch (error) {
    console.error("Error analyzing project:", error.message);
    res.status(502).json({ success: false, message: "AI analysis failed" });
  }
};

module.exports = {
  analyzeProject,
  createProject,
  updateProject,
  deleteProject,
  getAllProjects,
  getProjectById,
};
