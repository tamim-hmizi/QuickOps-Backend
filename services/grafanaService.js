const axios = require("axios");
const path = require("path");

const GRAFANA_URL = process.env.GRAFANA_URL?.replace(/\/$/, "");
const GRAFANA_USER = process.env.GRAFANA_USER;
const GRAFANA_PASS = process.env.GRAFANA_PASS;
const PROMETHEUS_URL = process.env.PROMETHEUS_URL;

const auth = {
  username: GRAFANA_USER,
  password: GRAFANA_PASS,
};

const addPrometheusDatasource = async () => {
  try {
    await axios.post(
      `${GRAFANA_URL}/api/datasources`,
      {
        name: "Prometheus",
        type: "prometheus",
        url: PROMETHEUS_URL,
        access: "proxy",
        isDefault: true,
      },
      { auth }
    );
    console.log("✅ Prometheus datasource created.");
  } catch (err) {
    if (err.response?.status === 409) {
      console.log("ℹ️ Prometheus datasource already exists.");
    } else {
      console.error("❌ Failed to add Prometheus datasource:", err.message);
      throw err;
    }
  }
};

const createDashboard = async (projectName, backendRepos) => {
  const uid = `dashboard-${projectName}`
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, "-");

  const panels = backendRepos.map((repoUrl, i) => {
    const repoName = path.basename(repoUrl).replace(/\.git$/, "");
    return {
      id: i + 1,
      title: `${repoName} Uptime`,
      type: "timeseries",
      datasource: "Prometheus",
      targets: [
        {
          expr: `up{job="${projectName}-${repoName}"}`,
          legendFormat: "{{instance}}",
          refId: "A",
        },
      ],
      gridPos: {
        x: (i % 2) * 12,
        y: Math.floor(i / 2) * 9,
        w: 12,
        h: 9,
      },
      fieldConfig: {
        defaults: {
          color: {
            mode: "palette-classic",
          },
          custom: {},
        },
      },
    };
  });

  const dashboardPayload = {
    dashboard: {
      uid,
      title: `${projectName} Monitoring`,
      tags: [projectName],
      timezone: "browser",
      schemaVersion: 36,
      version: 0,
      panels,
    },
    overwrite: true,
  };

  try {
    const res = await axios.post(
      `${GRAFANA_URL}/api/dashboards/db`,
      dashboardPayload,
      {
        auth,
        headers: { "Content-Type": "application/json" },
      }
    );
    console.log(`✅ Dashboard created or updated: ${projectName}`);
  } catch (err) {
    console.error("❌ Failed to create Grafana dashboard:", err.message);
    throw err;
  }
};

module.exports = { addPrometheusDatasource, createDashboard };
