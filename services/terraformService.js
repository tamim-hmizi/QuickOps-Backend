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

  // Both values are written into HCL, so only allow safe shapes.
  if (typeof project.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}[A-Za-z0-9]$/.test(project.name)) {
    throw new Error("Invalid 'project.name': use 2-40 letters, digits or hyphens.");
  }

  const md5 = crypto.createHash("md5").update(project.name).digest("hex");
  const projectNetId = parseInt(md5.substring(0, 2), 16) % 256;

  const backendPorts = Array.isArray(exposedPorts) ? exposedPorts.map(Number) : [];
  const badPort = backendPorts.find((port) => !Number.isInteger(port) || port < 1 || port > 65535);
  if (badPort !== undefined) {
    throw new Error(`Invalid exposed port: ${badPort}`);
  }

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

  const values = {
    project_name: project.name,
    subscription_id: process.env.subscription_id,
    tenant_id: process.env.tenant_id,
    client_id: process.env.client_id,
    client_secret: process.env.client_secret,
    object_id: process.env.object_id,
    location: process.env.location,
    ssh_public_key: process.env.ssh_public_key,
    resource_group_name: process.env.resource_group_name,
    quickops_admin_username: process.env.quickops_admin_username,
    project_net_id: projectNetId.toString(),
    backend_ports_rules: backendPortsRules,
  };

  // A replacer function keeps "$" in secrets literal; a replacement string would not.
  return template.replace(/{{(\w+)}}/g, (match, key) =>
    Object.hasOwn(values, key) ? values[key] : match
  );
};

module.exports = { generateTerraformContent };
