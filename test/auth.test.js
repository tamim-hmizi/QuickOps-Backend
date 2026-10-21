const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../app");
const User = require("../models/User");
const { useDatabase } = require("./helpers");

useDatabase("auth");

const creds = { email: "  Ops@Example.com ", password: "s3cure-passphrase" };

describe("auth", () => {
  it("registers with a normalized email and hashes the password", async () => {
    const res = await request(app).post("/api/auth/register").send(creds).expect(201);
    assert.equal(res.body.user.email, "ops@example.com");
    const stored = await User.findOne({ email: "ops@example.com" });
    assert.notEqual(stored.password, creds.password);
  });

  it("rejects missing fields and duplicates", async () => {
    await request(app).post("/api/auth/register").send({ email: "a@b.c" }).expect(400);
    await request(app).post("/api/auth/register").send(creds).expect(201);
    await request(app).post("/api/auth/register").send(creds).expect(409);
  });

  it("blocks inactive accounts until they are activated", async () => {
    await request(app).post("/api/auth/register").send(creds).expect(201);
    await request(app).post("/api/auth/login").send(creds).expect(403);

    await User.updateOne({ email: "ops@example.com" }, { active: true });
    const res = await request(app).post("/api/auth/login").send(creds).expect(200);
    assert.equal(res.body.user.active, true);
    assert.equal(res.body.user.password, undefined);
  });

  it("rejects a wrong password", async () => {
    await request(app).post("/api/auth/register").send(creds).expect(201);
    await request(app)
      .post("/api/auth/login")
      .send({ email: creds.email, password: "wrong" })
      .expect(401);
  });
});
