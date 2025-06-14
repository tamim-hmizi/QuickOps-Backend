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

  // Load sensitive data from .env file
  const {
    quickops_admin_username,
    ssh_private_key,
    NEXUS_REGISTRY_HTTPS,
    NEXUS_USER,
    NEXUS_PASS,
  } = process.env;

  const tmpDir = path.join(__dirname, `../${projectName}_k8s_ansible`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Save private SSH key
  const sshPrivateKeyPath = path.join(tmpDir, "id_rsa");
  fs.writeFileSync(
    sshPrivateKeyPath,
    ssh_private_key.replace(/^"|"$/g, "").replace(/\\n/g, "\n").trim() + "\n",
    { mode: 0o600 }
  );

  // Set the correct permissions for the private key
  fs.chmodSync(sshPrivateKeyPath, 0o600);

  const frontendName = path
    .basename(frontendRepo)
    .replace(/\.git$/, "")
    .toLowerCase();

  const backendNames = backendRepos.map((url) =>
    path.basename(url).replace(/\.git$/, "").toLowerCase()
  );

  // Read and render the playbook template
  const playbookTemplate = fs.readFileSync(
    path.join(__dirname, "../templates/k8s_deploy.yml.ejs"),
    "utf-8"
  );

  console.log(backendNames, frontendName)

  const playbookContent = ejs.render(playbookTemplate, {
    projectName,
    dnsLabel,
    sshUser: quickops_admin_username,
    frontendName,
    backendNames,
    buildId: build_id,
    registry: NEXUS_REGISTRY_HTTPS,
    registry_user: NEXUS_USER,
    registry_pass: NEXUS_PASS,
    ssh_private_key: sshPrivateKeyPath,
  });

  fs.writeFileSync(path.join(tmpDir, "k8s_deploy.yml"), playbookContent);

  return {
    tmpDir,
    playbookPath: path.join(tmpDir, "k8s_deploy.yml"),
  };
};

module.exports = { generateK8sAnsiblePlaybook };
