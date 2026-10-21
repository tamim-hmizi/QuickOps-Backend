const { before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { generateTerraformContent } = require("../services/terraformService");

const env = {
  subscription_id: "sub",
  tenant_id: "tenant",
  client_id: "client",
  client_secret: "pa$$word$&with$1dollars",
  object_id: "object",
  location: "westeurope",
  ssh_public_key: "ssh-ed25519 AAAA",
  resource_group_name: "rg-quickops",
  quickops_admin_username: "quickops",
};

describe("terraform generator", () => {
  before(() => Object.assign(process.env, env));

  it("fills every placeholder", () => {
    const tf = generateTerraformContent({ name: "shop-demo" }, [5000]);
    assert.doesNotMatch(tf, /{{\w+}}/);
    assert.match(tf, /shop-demo/);
    assert.match(tf, /destination_port_range\s+=\s+"5000"/);
  });

  it("writes secrets containing $ verbatim", () => {
    const tf = generateTerraformContent({ name: "shop-demo" }, []);
    assert.ok(tf.includes(env.client_secret));
  });

  it("derives a stable network id from the project name", () => {
    const a = generateTerraformContent({ name: "shop-demo" }, []);
    const b = generateTerraformContent({ name: "shop-demo" }, []);
    assert.equal(a, b);
  });

  it("rejects unsafe names and ports", () => {
    assert.throws(() => generateTerraformContent({ name: 'x" }\nresource "evil" {' }, []));
    assert.throws(() => generateTerraformContent({ name: "shop-demo" }, ["80\"\n}"]));
    assert.throws(() => generateTerraformContent({ name: "shop-demo" }, [70000]));
  });

  it("names the missing environment variable", () => {
    const saved = process.env.location;
    delete process.env.location;
    assert.throws(() => generateTerraformContent({ name: "shop-demo" }, []), /location/);
    process.env.location = saved;
  });
});
