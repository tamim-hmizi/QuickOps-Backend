const Project = require("../models/projectModel");

// Every lookup is scoped to the owner, so users only ever see their own projects.
const createProject = async (owner, projectData) => {
  const project = new Project({ ...projectData, owner });
  await project.save();
  return Project.findById(project._id);
};

const updateProject = (owner, id, updateData) =>
  Project.findOneAndUpdate({ _id: id, owner }, updateData, {
    new: true,
    runValidators: true,
  });

const deleteProject = (owner, id) => Project.findOneAndDelete({ _id: id, owner });

const getAllProjects = (owner) => Project.find({ owner });

const getProjectById = (owner, id) => Project.findOne({ _id: id, owner });

// Includes the GitHub token, for server-side use only.
const getProjectWithToken = (owner, id) =>
  Project.findOne({ _id: id, owner }).select("+githubToken");

const ownsProjectNamed = async (owner, name) => Boolean(await Project.exists({ owner, name }));

module.exports = {
  createProject,
  updateProject,
  deleteProject,
  getAllProjects,
  getProjectById,
  getProjectWithToken,
  ownsProjectNamed,
};
