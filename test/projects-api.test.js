const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const request = require("supertest");
const { useDatabase } = require("./helpers");

process.env.JWT_SECRET ??= "test-secret";

const app = require("../app");
const User = require("../models/User");
const Project = require("../models/projectModel");

const project = (name) => ({
  name,
  frontendRepo: "https://github.com/acme/web",
  backendRepos: ["https://github.com/acme/api"],
  githubToken: "ghp_secret_value",
});

async function signIn(email) {
  await User.create({ email, password: "s3cure-passphrase", active: true });
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "s3cure-passphrase" })
    .expect(200);
  return { Authorization: `Bearer ${res.body.token}` };
}

describe("projects API", () => {
  useDatabase("projects");

  // Stand-in for QuickOps-AI that records what it receives.
  let ai;
  let received;
  before(async () => {
    ai = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received = JSON.parse(body);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ recommendation: "VM", reasoning: "Small app." }));
      });
    });
    await new Promise((resolve) => ai.listen(0, resolve));
    process.env.AI_URL = `http://127.0.0.1:${ai.address().port}`;
  });
  after(() => new Promise((resolve) => ai.close(resolve)));

  it("rejects requests without a valid token", async () => {
    await request(app).get("/api/projects").expect(401);
    await request(app).get("/api/projects").set("Authorization", "Bearer forged").expect(401);
    await request(app).post("/api/deploy").send({ id: "x" }).expect(401);
    await request(app).get("/api/logs/full/shop/1").expect(401);
  });

  it("creates a project for its owner without exposing the GitHub token", async () => {
    const alice = await signIn("alice@example.com");
    const created = await request(app).post("/api/projects").set(alice).send(project("shop")).expect(201);
    assert.equal(created.body.project.githubToken, undefined);

    const list = await request(app).get("/api/projects").set(alice).expect(200);
    assert.equal(list.body.projects.length, 1);
    assert.equal(list.body.projects[0].githubToken, undefined);

    const stored = await Project.findOne({ name: "shop" }).select("+githubToken");
    assert.equal(stored.githubToken, "ghp_secret_value");
  });

  it("keeps each user's projects private", async () => {
    const alice = await signIn("alice@example.com");
    const bob = await signIn("bob@example.com");
    const { body } = await request(app).post("/api/projects").set(alice).send(project("shop")).expect(201);
    const id = body.project._id;

    assert.equal((await request(app).get("/api/projects").set(bob).expect(200)).body.projects.length, 0);
    await request(app).get(`/api/projects/${id}`).set(bob).expect(404);
    await request(app).put(`/api/projects/${id}`).set(bob).send({ status: "deployed" }).expect(404);
    await request(app).delete(`/api/projects/${id}`).set(bob).expect(404);
    await request(app).post("/api/deploy").set(bob).send({ id }).expect(404);
    await request(app).get("/api/logs/full/shop/1").set(bob).expect(404);
    await request(app).post(`/api/projects/${id}/analyze`).set(bob).expect(404);

    await request(app).get(`/api/projects/${id}`).set(alice).expect(200);
  });

  it("refuses a second project with the same name", async () => {
    const alice = await signIn("alice@example.com");
    const bob = await signIn("bob@example.com");
    await request(app).post("/api/projects").set(alice).send(project("shop")).expect(201);
    await request(app).post("/api/projects").set(bob).send(project("shop")).expect(409);
  });

  it("returns 400 for invalid project input", async () => {
    const alice = await signIn("alice@example.com");
    await request(app).post("/api/projects").set(alice).send(project("bad name; rm -rf /")).expect(400);
  });

  it("runs the AI analysis on the server with the stored token", async () => {
    const alice = await signIn("alice@example.com");
    const { body } = await request(app).post("/api/projects").set(alice).send(project("shop")).expect(201);

    const res = await request(app).post(`/api/projects/${body.project._id}/analyze`).set(alice).expect(200);
    assert.equal(res.body.updatedProject.recommendation, "VM");
    assert.equal(res.body.updatedProject.githubToken, undefined);
    assert.deepEqual(received, {
      frontend: "https://github.com/acme/web",
      backends: ["https://github.com/acme/api"],
      token: "ghp_secret_value",
    });
  });
});
