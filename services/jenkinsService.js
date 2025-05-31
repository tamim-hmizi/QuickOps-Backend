const axios = require("axios");
const xmlbuilder = require("xmlbuilder");

const JENKINS_URL = process.env.JENKINS_URL;
const JENKINS_USER = process.env.JENKINS_USER;
const JENKINS_API_TOKEN = process.env.JENKINS_API_TOKEN;


const auth = {
  username: JENKINS_USER,
  password: JENKINS_API_TOKEN,
};

const jobExists = async (jobName) => {
  const url = `${JENKINS_URL}/job/${encodeURIComponent(jobName)}/api/json`;
  try {
    await axios.get(url, { auth });
    return true;
  } catch (err) {
    if (err.response?.status === 404) return false;
    throw err;
  }
};

const createOrUpdatePipeline = async (jobName, jenkinsfile) => {
  const configXml = xmlbuilder
    .create("flow-definition", { encoding: "utf-8" })
    .att("plugin", "workflow-job@2.40")
    .ele("description")
    .txt(`Pipeline for ${jobName}`)
    .up()
    .ele("keepDependencies")
    .txt("false")
    .up()
    .ele("definition", {
      class: "org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition",
      plugin: "workflow-cps@2.94",
    })
    .ele("script")
    .cdata(jenkinsfile)
    .up()
    .ele("sandbox")
    .txt("true")
    .up()
    .up()
    .ele("triggers")
    .up()
    .ele("disabled")
    .txt("false")
    .end({ pretty: true });

  const headers = { "Content-Type": "application/xml" };
  const exists = await jobExists(jobName);
  const url = exists
    ? `${JENKINS_URL}/job/${encodeURIComponent(jobName)}/config.xml`
    : `${JENKINS_URL}/createItem?name=${encodeURIComponent(jobName)}`;

  await axios.post(url, configXml, { headers, auth });
};

const triggerBuild = async (jobName) => {
  const url = `${JENKINS_URL}/job/${encodeURIComponent(jobName)}/build`;
  const { headers } = await axios.post(url, null, { auth });

  const queueItemUrl = headers.location;
  const queueId = queueItemUrl.match(/item\/(\d+)/)?.[1];

  for (let i = 0; i < 30; i++) {
    const { data } = await axios.get(
      `${JENKINS_URL}/queue/item/${queueId}/api/json`,
      { auth }
    );
    if (data.executable?.number) return data.executable.number;
    await new Promise((res) => setTimeout(res, 2000));
  }

  throw new Error("Timeout while waiting for build to start");
};

const waitForBuildToFinish = async (jobName, buildId) => {
  const url = `${JENKINS_URL}/job/${jobName}/${buildId}/api/json`;
  for (let i = 0; i < 120; i++) {
    const { data } = await axios.get(url, { auth });
    if (!data.building) return data.result;
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error("Build did not finish in time");
};

const getBuildStages = async (jobName, buildId) => {
  const url = `${JENKINS_URL}/job/${jobName}/${buildId}/wfapi/describe`;
  const { data } = await axios.get(url, { auth });
  return data.stages;
};

const getBuildLog = async (jobName, buildId) => {
  const url = `${JENKINS_URL}/job/${jobName}/${buildId}/consoleText`;
  const { data } = await axios.get(url, { auth });
  return data;
};

module.exports = {
  createOrUpdatePipeline,
  triggerBuild,
  waitForBuildToFinish,
  getBuildStages,
  getBuildLog,
};
