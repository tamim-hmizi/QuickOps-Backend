const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
require("dotenv").config();

const generateK8sAnsiblePlaybook = async (project) => {
  const {
    name: projectName,
    dnsLabel,
    build_id,
    frontendRepo,
    backendRepos,
  } = project;

  const {
    quickops_admin_username,
    ssh_private_key,
    NEXUS_REGISTRY,
    NEXUS_USER,
    NEXUS_PASS,
  } = process.env;

  const tmpDir = path.join(__dirname, `../${projectName}_k8s_ansible`);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  // Save SSH key
  const sshKeyPath = path.join(tmpDir, "id_rsa");
  fs.writeFileSync(
    sshKeyPath,
    ssh_private_key.replace(/^"|"$/g, "").replace(/\\n/g, "\n").trim() + "\n",
    { mode: 0o600 }
  );

  // Derive repo names
  const frontendName = path.basename(frontendRepo).replace(/\.git$/, "");
  const backendNames = backendRepos.map((url) =>
    path.basename(url).replace(/\.git$/, "")
  );

  // Render Ansible playbook
  const playbookTemplate = fs.readFileSync(
    path.join(__dirname, "../templates/k8s_deploy.yml.ejs"),
    "utf-8"
  );

  const playbookContent = ejs.render(playbookTemplate, {
    projectName,
    dnsLabel,
    sshKeyPath: "./id_rsa",
    sshUser: quickops_admin_username,
    frontendName,
    backendNames,
    buildId: build_id,
    registry: NEXUS_REGISTRY,
    registry_user: NEXUS_USER,
    registry_pass: NEXUS_PASS,
  });

  const playbookPath = path.join(tmpDir, "k8s_deploy.yml");
  fs.writeFileSync(playbookPath, playbookContent);

  return {
    tmpDir,
    playbookPath,
  };
};

module.exports = { generateK8sAnsiblePlaybook };
