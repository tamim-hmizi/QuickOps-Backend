const axios = require("axios");

const SONAR_URL = process.env.SONAR_URL;
const SONAR_TOKEN = process.env.SONAR_TOKEN;

/**
 * Check if the project key already exists in SonarQube.
 * Returns true if exists, false otherwise.
 */
const checkSonarProjectExists = async (projectKey) => {
  try {
    const url = `${SONAR_URL}/api/projects/search?projects=${projectKey}`;
    const res = await axios.get(url, {
      auth: {
        username: SONAR_TOKEN,
        password: "",
      },
    });
    return res.data.components && res.data.components.length > 0;
  } catch (err) {
    console.error(
      `❌ Failed to check project existence for ${projectKey}:`,
      err.message
    );
    throw err;
  }
};

/**
 * Create a SonarQube project if it doesn't already exist.
 */
const createSonarProject = async (projectKey, projectName) => {
  try {
    const exists = await checkSonarProjectExists(projectKey);
    if (exists) {
      console.log(
        `ℹ️ SonarQube project '${projectKey}' already exists on server.`
      );
      return;
    }

    const url = `${SONAR_URL}/api/projects/create`;
    await axios.post(
      url,
      new URLSearchParams({ name: projectName, project: projectKey }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        auth: {
          username: SONAR_TOKEN,
          password: "",
        },
      }
    );
    console.log(`✅ Created SonarQube project: ${projectKey}`);
  } catch (err) {
    console.error("❌ Failed to create SonarQube project:", err.message);
    throw err;
  }
};

module.exports = {
  createSonarProject,
  checkSonarProjectExists,
};
