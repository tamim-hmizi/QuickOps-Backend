const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const { execSync } = require("child_process");
const crypto = require("crypto");
require("dotenv").config();

const generateAksCluster = async (project) => {
  const projectName = project.name.toLowerCase();
  const resourceGroupName = process.env.resource_group_name;
  const location = process.env.location;
  const subscriptionId = process.env.subscription_id;

  // Check if resources with project name already exist
  console.log("🔍 Checking for existing AKS resources...");
  const azCmd = `az resource list --resource-group ${resourceGroupName} --query "[?contains(name, 'k8s-${projectName}')]" -o tsv`;

  let existingResources = "";
  try {
    existingResources = execSync(azCmd, { encoding: "utf-8" }).trim();
  } catch (err) {
    console.warn("⚠️ Failed to query Azure resources. Assuming none exist.");
  }

  if (existingResources) {
    console.log("⏭️ Resources already exist for this project. Skipping AKS deployment.");
    return { tmpDir: null, skipped: true };
  }

  // Proceed with AKS Engine deployment
  const tmpDir = path.join(__dirname, `../aksengine/${projectName}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const hash = crypto.createHash("md5").update(projectName).digest("hex");
  const cidrSuffix = (parseInt(hash.substring(0, 2), 16) % 200) + 1;
  const vnetCidr = `10.${cidrSuffix}.0.0/16`;
  const firstIP = `10.${cidrSuffix}.0.5`;

  const templatePath = path.join(__dirname, "../templates/aks-engine.json.ejs");
  const rendered = ejs.render(fs.readFileSync(templatePath, "utf-8"), {
    projectName,
    location,
    ssh_public_key: process.env.ssh_public_key,
    client_id: process.env.client_id,
    client_secret: process.env.client_secret,
    quickops_admin_username: process.env.quickops_admin_username,
    vnetCidr,
    firstIP,
  });

  const jsonPath = path.join(tmpDir, "cluster.json");
  if (!rendered || rendered.trim() === "") {
    throw new Error("❌ Rendered cluster.json is empty or invalid!");
  }

  fs.writeFileSync(jsonPath, rendered);
  console.log(`📦 cluster.json saved at: ${jsonPath}`);

  execSync(
    `aks-engine-azurestack generate --api-model ${jsonPath} --output-directory ${tmpDir}`,
    { stdio: "inherit" }
  );

  console.log(`📢 Launching deploy with: ${jsonPath}`);
  execSync(
    `aks-engine-azurestack deploy \
    -m ${jsonPath} \
    --location ${location} \
    --resource-group ${resourceGroupName} \
    --subscription-id ${subscriptionId} \
    --client-id ${process.env.client_id} \
    --client-secret ${process.env.client_secret} \
    --azure-env AzureStackCloud \
    --force-overwrite`,
    { stdio: "inherit" }
  );

  return { tmpDir, skipped: false };
};

module.exports = { generateAksCluster };
