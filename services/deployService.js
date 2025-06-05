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
const { generateAksCluster } = require("./aksEngineService");
const { updatePrometheusTargets } = require("./prometheusService");
const {
  createDashboard,
  addPrometheusDatasource,
} = require("./grafanaService");

const projectService = require("./projectService");
const Project = require("../models/projectModel");
const { generateK8sAnsiblePlaybook } = require("./ansibleK8sService");

const triggerPipeline = async (project) => {
  const { name, frontendRepo, backendRepos, githubToken, deploymentChoice } =
    project;

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

  let publicIp = "";
  let dnsLabel = "";

  if (deploymentChoice === "VM") {
    // 4. Terraform for VM
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

    // 5. Ansible for VM
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
  } else if (deploymentChoice === "Kubernetes") {
    // 4. AKS Engine for K8s
    const { tmpDir } = await generateAksCluster(project);

    // ✅ Build custom DNS label directly
    dnsLabel = `${name.toLowerCase()}.dc2.cloudapp.xpressazure.com`;

    // 🧠 Update MongoDB project entry
    const mongoProject = await Project.findOne({ name });
    if (mongoProject) {
      await projectService.updateProject(mongoProject._id, {
        publicIp: "", // optional: can be updated later
        dnsLabel,
      });
    }

    // 🧹 Clean up AKS Engine files
    const cleanupPaths = [
      tmpDir,
      path.join(__dirname, "../_output"),
      path.join(__dirname, "../translations"),
      path.join(__dirname, "../aksengine"),
    ];

    for (const dir of cleanupPaths) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`🧹 Cleaned up: ${dir}`);
      }
    }

    // 5. Ansible for K8s
    try {
      const { tmpDir, playbookPath } = await generateK8sAnsiblePlaybook({
        name,
        dnsLabel,
        build_id: buildId,
        frontendRepo,
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
      console.error("❌ Ansible K8s failed:", err.message);
      throw err;
    }
  }

  // 6. Prometheus
  try {
    await updatePrometheusTargets(name, dnsLabel, backendRepos);
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
    await addPrometheusDatasource();
    await createDashboard(name, backendRepos);

    const mongoProject = await Project.findOne({ name });
    if (mongoProject) {
      await projectService.updateProject(mongoProject._id, {
        status: "deployed",
      });
      console.log(`📦 Project "${name}" marked as deployed`);
    }
  } catch (err) {
    console.error("❌ Grafana dashboard creation failed:", err.message);
    throw err;
  }

  return { buildId, stages, status };
};

module.exports = { triggerPipeline };
