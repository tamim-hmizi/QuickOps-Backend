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

  const values = {
    projectName: name,
    frontendRepo,
    backendRepos: backendRepos.map((url) => `"${url}"`).join(", "),
    githubToken,
  };
  // A replacer function keeps "$" in the token literal; a replacement string would not.
  const filledJenkinsfile = jenkinsTemplate.replace(/{{(\w+)}}/g, (match, key) =>
    Object.hasOwn(values, key) ? values[key] : match
  );

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

      const mongoProject = await Project.findById(project._id);
      if (mongoProject) {
        await projectService.updateProject(mongoProject.owner, mongoProject._id, {
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
        `ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook  -i 'k8s-${dnsLabel},' ${playbookPath}`,
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
    // 5.1 Update Ingress Controller Public IP and DNS
    try {
      console.log("🌐 Fetching public IP for Ingress Controller...");

      // Fetch public IPs that contain the project name (and not 'k8s')
      const publicIpInfoJson = execSync(
        `az network public-ip list --resource-group ${process.env.resource_group_name} --query "[?contains(name, '${name.toLowerCase()}')]" --output json`,
        { encoding: "utf-8" }
      );

      const publicIps = JSON.parse(publicIpInfoJson);

      if (!publicIps.length) throw new Error("No matching public IP found.");

      // Filter out the IPs that contain "k8s" in the name
      const filteredPublicIps = publicIps.filter(ip => !ip.name.includes('master'));

      if (filteredPublicIps.length === 0) throw new Error("No matching public IP found after filtering out 'k8s'.");

      const ingressIpObj = filteredPublicIps[0];
      const ingressIp = ingressIpObj.ipAddress;
      const publicIpResourceName = ingressIpObj.name;

      console.log(`✅ Found Ingress IP: ${ingressIp} (resource: ${publicIpResourceName})`);

      // Update DNS label to project name (e.g., 'ecomshop')
      execSync(
        `az network public-ip update --resource-group ${process.env.resource_group_name} --name ${publicIpResourceName} --dns-name ${name.toLowerCase()}`,
        { stdio: "inherit" }
      );

      const updatedDns = `${name.toLowerCase()}.dc2.cloudapp.xpressazure.com`;

      const mongoProject = await Project.findById(project._id);
      if (mongoProject) {
        await projectService.updateProject(mongoProject.owner, mongoProject._id, {
          publicIp: ingressIp,
          dnsLabel: updatedDns,
        });
        console.log("✅ Mongo project updated with ingress IP and DNS.");
      }
    } catch (err) {
      console.error("❌ Failed to update Ingress IP and DNS label:", err.message);
      throw err;
    }

  }





  // 6. Prometheus
  try {
    await updatePrometheusTargets(name, dnsLabel, backendRepos, deploymentChoice);
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
    await createDashboard(name, backendRepos, deploymentChoice);


    const mongoProject = await Project.findById(project._id);
    if (mongoProject) {
      await projectService.updateProject(mongoProject.owner, mongoProject._id, {
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
