// ./services/azureBlobService.js
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const accountName = "quickopstfstate";
const containerName = "tfstate";
const sasToken = process.env.AZURE_STORAGE_SAS;

/**
 * Upload tfstate from given directory to Azure Blob
 */
const uploadTfState = async (projectName, fromDir) => {
  const blobName = `${projectName}.tfstate`;
  const filePath = path.join(fromDir, blobName);
  const fileContent = fs.readFileSync(filePath);

  const url = `https://${accountName}.blob.dc2.xpressazure.com/${containerName}/${blobName}?${sasToken}`;
  const headers = {
    "x-ms-blob-type": "BlockBlob",
    "x-ms-version": "2020-10-02",
    "Content-Length": fileContent.length,
    "Content-Type": "application/octet-stream",
  };

  const response = await axios.put(url, fileContent, { headers });

  if (response.status === 201) {
    console.log(`✅ Uploaded ${blobName} from ${fromDir}`);
  } else {
    throw new Error(`❌ Upload failed: status ${response.status}`);
  }
};

/**
 * Download tfstate into the given directory
 */
const downloadTfState = async (projectName, targetDir) => {
  const blobName = `${projectName}.tfstate`;
  const filePath = path.join(targetDir, blobName);
  const url = `https://${accountName}.blob.dc2.xpressazure.com/${containerName}/${blobName}?${sasToken}`;

  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "x-ms-version": "2020-10-02",
      },
    });

    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(filePath, response.data);
    console.log(`✅ Downloaded ${blobName} into ${targetDir}`);
  } catch (err) {
    if (err.response?.status === 404) {
      console.warn(`⚠️ ${blobName} not found in Azure Blob. New project.`);
    } else {
      console.error("❌ Failed to download tfstate:", err.response?.status);
      throw err;
    }
  }
};

module.exports = { uploadTfState, downloadTfState };
