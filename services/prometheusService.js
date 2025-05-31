const fs = require("fs");
const path = require("path");
const { NodeSSH } = require("node-ssh");
const dotenv = require("dotenv");

dotenv.config();
const ssh = new NodeSSH();

const PROM_HOST = "quickops.dc2.cloudapp.xpressazure.com";
const PROM_USER = process.env.quickops_admin_username;
const PRIVATE_KEY = process.env.ssh_private_key;
const TARGETS_REMOTE_PATH = "/etc/prometheus/quickops-targets.json";
const PROM_CONTAINER_NAME = "prometheus";

const updatePrometheusTargets = async (projectName, vmDns, backendRepos) => {
  try {
    const configDir = path.join(
      __dirname,
      `../prometheus_config_${projectName}`
    );
    fs.mkdirSync(configDir, { recursive: true });

    const TARGETS_LOCAL_PATH = path.join(configDir, "quickops-targets.json");

    await ssh.connect({
      host: PROM_HOST,
      username: PROM_USER,
      privateKey: PRIVATE_KEY,
    });

    await ssh.getFile(TARGETS_LOCAL_PATH, TARGETS_REMOTE_PATH);

    let current = [];
    if (fs.existsSync(TARGETS_LOCAL_PATH)) {
      const content = fs.readFileSync(TARGETS_LOCAL_PATH, "utf8");
      current = JSON.parse(content);
    }

    // Use repo names in job labels
    const newTargets = backendRepos.map((repoUrl, i) => {
      const repoName = path.basename(repoUrl).replace(/\.git$/, "");
      const port = 5000 + i;
      return {
        targets: [`${vmDns}:${port}`],
        labels: { job: `${projectName}-${repoName}` },
      };
    });

    const combined = [...current];
    for (const newT of newTargets) {
      const exists = current.some(
        (t) =>
          t.labels?.job === newT.labels.job &&
          JSON.stringify(t.targets) === JSON.stringify(newT.targets)
      );
      if (!exists) combined.push(newT);
    }

    fs.writeFileSync(TARGETS_LOCAL_PATH, JSON.stringify(combined, null, 2));
    await ssh.putFile(TARGETS_LOCAL_PATH, TARGETS_REMOTE_PATH);

    const reloadCmd = `docker kill --signal=SIGHUP ${PROM_CONTAINER_NAME}`;
    const { stdout, stderr } = await ssh.execCommand(reloadCmd);

    if (stderr) {
      console.error("❌ Prometheus reload error:", stderr);
    } else {
      console.log("🔁 Prometheus container reloaded via SIGHUP");
    }

    ssh.dispose();
    console.log(`✅ Prometheus targets updated for ${projectName}`);
  } catch (err) {
    console.error("❌ Failed to update Prometheus targets:", err);
  }
};

module.exports = { updatePrometheusTargets };
