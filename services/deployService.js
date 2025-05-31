const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const {
  createOrUpdatePipeline,
  triggerBuild,
  waitForBuildToFinish,
  getBuildStages,
} = require("./jenkinsService");

const { createSonarProject } = require("./sonarqubeService");

const { uploadTfState, downloadTfState } = require("./azureBlobService");
const { generateTerraformContent } = require("./terraformService");
const { generateAnsiblePlaybook } = require("./ansibleService");
const projectService = require("./projectService");
const Project = require("../models/projectModel");
const { updatePrometheusTargets } = require("./prometheusService");
const {
  createDashboard,
  addPrometheusDatasource,
} = require("./grafanaService");
const triggerPipeline = async (project) => {
  const { name, frontendRepo, backendRepos, githubToken, deploymentChoice } =
    project;
  if (deploymentChoice !== "VM") return;
  if (!name) throw new Error("Project name is required for pipeline trigger.");

  // 1. Create SonarQube Projects
  await createSonarProject(`${name}-frontend`, `${name} Frontend`);
  await Promise.all(
    backendRepos.map((url) => {
      const repoName = path.basename(url).replace(/\.git$/, "");
      return createSonarProject(`${name}-${repoName}`, `${name} ${repoName}`);
    })
  );

  // 2. Generate Jenkinsfile
  const jenkinsTemplate = fs.readFileSync(
    path.join(__dirname, "../templates/Jenkinsfile.vm.groovy"),
    "utf-8"
  );

  const filledJenkinsfile = jenkinsTemplate
    .replace(/{{projectName}}/g, name)
    .replace(/{{frontendRepo}}/g, frontendRepo)
    .replace(
      /{{backendRepos}}/g,
      backendRepos.map((url) => `"${url}"`).join(", ")
    )
    .replace(/{{githubToken}}/g, githubToken);

  await createOrUpdatePipeline(name, filledJenkinsfile);

  // 3. Build Pipeline
  const buildId = await triggerBuild(name);
  await waitForBuildToFinish(name, buildId);
  const stages = await getBuildStages(name, buildId);

  const status = stages.some((s) => s.status === "FAILED")
    ? "FAILED"
    : stages.some((s) => s.status === "ABORTED")
    ? "ABORTED"
    : "SUCCESS";

  if (status !== "SUCCESS") return { buildId, stages, status };

  // 4. Terraform Infrastructure
  const tfDir = path.join(__dirname, `../terraform_${name}`);
  fs.mkdirSync(tfDir, { recursive: true });
  const exposedPorts = backendRepos.map((_, i) => 5000 + i);
  const tfPath = path.join(tfDir, "main.tf");

  fs.writeFileSync(tfPath, generateTerraformContent(project, exposedPorts));

  try {
    await downloadTfState(name, tfDir);
  } catch (err) {
    console.warn("⚠️ No previous tfstate:", err.message);
  }

  let publicIp = "",
    dnsLabel = "";
  try {
    execSync("terraform init", { cwd: tfDir, stdio: "inherit" });
    execSync(`terraform apply -auto-approve -state=${name}.tfstate`, {
      cwd: tfDir,
      stdio: "inherit",
    });

    const tfOutput = JSON.parse(
      execSync(`terraform output -json -state=${name}.tfstate`, {
        cwd: tfDir,
        encoding: "utf-8",
      })
    );

    publicIp = tfOutput.vm_public_ip?.value || "";
    dnsLabel = tfOutput.vm_dns?.value || "";

    if (!publicIp || !dnsLabel)
      throw new Error("Missing IP or DNS output from Terraform");

    const mongoProject = await Project.findOne({ name });
    if (mongoProject) {
      await projectService.updateProject(mongoProject._id, {
        publicIp,
        dnsLabel,
      });
    }

    await uploadTfState(name, tfDir);
    fs.rmSync(tfDir, { recursive: true, force: true });
  } catch (err) {
    console.error("❌ Terraform failed:", err.message);
    throw err;
  }

  // 5. Run Ansible
  try {
    const { tmpDir, playbookPath } = await generateAnsiblePlaybook({
      name,
      vm_dns: dnsLabel,
      build_id: buildId,
      backendRepos,
    });

    execSync(
      `ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i '${dnsLabel},' ${playbookPath}`,
      {
        cwd: tmpDir,
        env: process.env,
        stdio: "inherit",
      }
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (err) {
    console.error("❌ Ansible failed:", err.message);
    throw err;
  }

  // 6. Prometheus
  try {
    await updatePrometheusTargets(name, dnsLabel, backendRepos);
    // 🧹 Clean up Prometheus config directory
    const promConfigDir = path.join(__dirname, `../prometheus_config_${name}`);
    if (fs.existsSync(promConfigDir)) {
      fs.rmSync(promConfigDir, { recursive: true, force: true });
      console.log(`🧹 Deleted ${promConfigDir} after Prometheus update`);
    }
  } catch (err) {
    console.error("❌ Prometheus configuration failed:", err.message);
    throw err;
  }

  // 7. Grafana
  try {
    await addPrometheusDatasource(); // Create or ensure Prometheus is there
    await createDashboard(name, backendRepos); // Add clean dashboard
  } catch (err) {
    console.error("❌ Grafana dashboard creation failed:", err.message);
    throw err;
  }

  return { buildId, stages, status };
};

module.exports = { triggerPipeline };
