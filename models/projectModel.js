const mongoose = require("mongoose");

// The name becomes a DNS label and is used in Terraform, Jenkins and shell
// commands, and repository URLs are written into the Jenkinsfile, so both are
// restricted to safe shapes.
const PROJECT_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}[A-Za-z0-9]$/;
const GITHUB_REPO = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    match: [PROJECT_NAME, "Use 2-40 letters, digits or hyphens, starting and ending with a letter or digit."],
  },
  frontendRepo: {
    type: String,
    required: true,
    trim: true,
    match: [GITHUB_REPO, "Use an https://github.com/owner/repo URL."],
  },
  backendRepos: {
    type: [{ type: String, trim: true, match: [GITHUB_REPO, "Use https://github.com/owner/repo URLs."] }],
    required: true,
  },
  githubToken: { type: String, required: true },
  status: {
    type: String,
    enum: ["deployed", "not deployed"],
    default: "not deployed",
  },
  recommendation: {
    type: String, // e.g. "Kubernetes" or "VM"
  },
  reasoning: {
    type: String, // explanation for the recommendation
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
