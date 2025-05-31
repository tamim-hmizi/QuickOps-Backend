const Project = require("../models/projectModel");
require("dotenv").config();

const createProject = async (projectData) => {
  const project = new Project(projectData);
  await project.save();
  return project;
};

const updateProject = async (id, updateData) => {
  const project = await Project.findByIdAndUpdate(id, updateData, {
    new: true,
  });
  return project;
};

const deleteProject = async (id) => {
  const project = await Project.findByIdAndDelete(id);
  return project;
};

const getAllProjects = async () => {
  const projects = await Project.find();
  return projects;
};

const getProjectById = async (id) => {
  const project = await Project.findById(id);
  return project;
};

module.exports = {
  createProject,
  updateProject,
  deleteProject,
  getAllProjects,
  getProjectById,
};
