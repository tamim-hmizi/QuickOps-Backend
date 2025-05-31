const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const ejs = require("ejs");

dotenv.config();

const generateAnsiblePlaybook = async (project) => {
  try {
    const {
      ssh_private_key,
      quickops_admin_username,
      NEXUS_REGISTRY,
      NEXUS_USER,
      NEXUS_PASS,
    } = process.env;

    const {
      name: projectName,
      vm_dns: vmDns,
      build_id,
      backendRepos,
    } = project;

    const tmpDir = path.join(__dirname, `../${projectName}_ansible`);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }

    const sshKeyPath = path.join(tmpDir, "id_rsa");
    fs.writeFileSync(
      sshKeyPath,
      ssh_private_key.replace(/^"|"$/g, "").replace(/\\n/g, "\n").trim() + "\n",
      { mode: 0o600 }
    );

    const backendBlocks = backendRepos.map((repoUrl) => {
      const repoName = path.basename(repoUrl).replace(/\.git$/, "");
      return {
        name: repoName,
        image: `${NEXUS_REGISTRY}/${projectName}:${repoName}-${build_id}`,
      };
    });

    const templatePath = path.join(__dirname, "../templates/vm_playbook.yml");
    const templateContent = fs.readFileSync(templatePath, "utf-8");

    const renderedPlaybook = ejs.render(templateContent, {
      project_name: projectName,
      vm_dns: vmDns,
      quickops_admin_username,
      nexus_host: NEXUS_REGISTRY,
      nexus_username: NEXUS_USER,
      nexus_password: NEXUS_PASS,
      frontend_image: `${NEXUS_REGISTRY}/${projectName}:frontend-${build_id}`,
      backends: backendBlocks,
    });

    const playbookPath = path.join(tmpDir, "playbook.yml");
    fs.writeFileSync(playbookPath, renderedPlaybook);

    console.log(`✅ Ansible playbook created at: ${playbookPath}`);
    return { tmpDir, playbookPath, sshKeyPath, vmDns };
  } catch (err) {
    console.error("❌ Failed to generate Ansible playbook:", err);
    throw err;
  }
};

module.exports = { generateAnsiblePlaybook };
