const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const generateTerraformContent = (project, exposedPorts) => {
  const templatePath = path.join(__dirname, "../templates/vm_template.tf.tmpl");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found at path: ${templatePath}`);
  }

  const template = fs.readFileSync(templatePath, "utf-8");
  if (!template.trim()) {
    throw new Error("Template file is empty.");
  }

  if (!project.name || typeof project.name !== "string") {
    throw new Error("Invalid or missing 'project.name' in Terraform input.");
  }

  const md5 = crypto.createHash("md5").update(project.name).digest("hex");
  const projectNetId = parseInt(md5.substring(0, 2), 16) % 256;

  const backendPorts = Array.isArray(exposedPorts) ? exposedPorts : [];

  const backendPortsRules = backendPorts
    .map(
      (port, i) => `
  security_rule {
    name                       = "Allow-Backend-${port}"
    priority                   = ${130 + i}
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "${port}"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }`
    )
    .join("\n");

  const requiredEnv = [
    "subscription_id",
    "tenant_id",
    "client_id",
    "client_secret",
    "object_id",
    "location",
    "ssh_public_key",
    "resource_group_name",
    "quickops_admin_username",
  ];
  requiredEnv.forEach((key) => {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  });

  return template
    .replace(/{{project_name}}/g, project.name)
    .replace(/{{subscription_id}}/g, process.env.subscription_id)
    .replace(/{{tenant_id}}/g, process.env.tenant_id)
    .replace(/{{client_id}}/g, process.env.client_id)
    .replace(/{{client_secret}}/g, process.env.client_secret)
    .replace(/{{object_id}}/g, process.env.object_id)
    .replace(/{{location}}/g, process.env.location)
    .replace(/{{ssh_public_key}}/g, process.env.ssh_public_key)
    .replace(/{{resource_group_name}}/g, process.env.resource_group_name)
    .replace(
      /{{quickops_admin_username}}/g,
      process.env.quickops_admin_username
    )
    .replace(/{{project_net_id}}/g, projectNetId.toString())
    .replace(/{{backend_ports_rules}}/g, backendPortsRules);
};

module.exports = { generateTerraformContent };
