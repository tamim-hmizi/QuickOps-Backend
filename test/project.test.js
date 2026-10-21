const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Project = require("../models/projectModel");

const valid = {
  name: "shop-demo",
  frontendRepo: "https://github.com/acme/shop-frontend",
  backendRepos: ["https://github.com/acme/shop-api.git"],
  githubToken: "ghp_example",
};

const errorsFor = (data) => Object.keys(new Project(data).validateSync()?.errors ?? {});

describe("project validation", () => {
  it("accepts DNS-safe names and GitHub URLs", () => {
    assert.deepEqual(errorsFor(valid), []);
    assert.deepEqual(errorsFor({ ...valid, name: "ShopDemo2" }), []);
  });

  for (const name of ["a", "-shop", "shop-", "shop demo", "shop;rm -rf /", "shop$(id)", "x".repeat(41)]) {
    it(`rejects the name ${JSON.stringify(name)}`, () => {
      assert.ok(errorsFor({ ...valid, name }).includes("name"));
    });
  }

  for (const url of ["http://github.com/a/b", "https://gitlab.com/a/b", "https://github.com/a/b\"; sh -c x"]) {
    it(`rejects the repository ${JSON.stringify(url)}`, () => {
      assert.ok(errorsFor({ ...valid, frontendRepo: url }).includes("frontendRepo"));
      assert.ok(errorsFor({ ...valid, backendRepos: [url] }).some((e) => e.startsWith("backendRepos")));
    });
  }
});
