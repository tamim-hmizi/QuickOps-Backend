const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  frontendRepo: { type: String, required: true },
  backendRepos: { type: [String], required: true },
  githubToken: { type: String, required: true },
  status: {
    type: String,
    enum: ["deployed", "not deployed"],
    default: "not deployed",
  },
  recommendation: {
    type: String,
  },
  deploymentChoice: {
    type: String,
    enum: ["VM", "KUBERNETES"],
  },
  publicIp: { type: String },
  dnsLabel: { type: String },
});

const Project = mongoose.model("Project", projectSchema);

module.exports = Project;
