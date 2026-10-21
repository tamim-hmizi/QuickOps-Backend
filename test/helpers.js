const { after, before, beforeEach } = require("node:test");
const mongoose = require("mongoose");

// Each test file gets its own database on the MongoDB in MONGO_URI.
function useDatabase(name) {
  before(async () => {
    const uri = process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017";
    await mongoose.connect(uri, { dbName: `test-quickops-${name}-${process.pid}` });
  });
  beforeEach(async () => {
    await Promise.all(
      Object.values(mongoose.connection.collections).map((c) => c.deleteMany({}))
    );
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
}

module.exports = { useDatabase };
