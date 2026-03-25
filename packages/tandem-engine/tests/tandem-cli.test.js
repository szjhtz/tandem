const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildEngineServiceDefinition,
  detectPackageManager,
  findCommandOnPath,
  parseArgs,
  resolveTandemHomeDir,
  resolveTandemPaths,
} = require("../bin/tandem.js");

test("parseArgs handles flags and values", () => {
  const cli = parseArgs(["doctor", "--json", "--env-file", "/tmp/tandem.env", "--name=value"]);
  assert.equal(cli.has("json"), true);
  assert.equal(cli.value("env-file"), "/tmp/tandem.env");
  assert.equal(cli.value("name"), "value");
});

test("detectPackageManager defaults to npm", () => {
  const pm = detectPackageManager({ npm_config_user_agent: "" });
  assert.equal(pm.name, "npm");
  assert.deepEqual(pm.installArgs, ["install", "-g"]);
});

test("resolveTandemHomeDir respects state overrides", () => {
  assert.equal(
    resolveTandemHomeDir({ TANDEM_STATE_DIR: "/tmp/tandem-state" }, "linux"),
    "/tmp/tandem-state"
  );
});

test("resolveTandemPaths fills expected defaults", () => {
  const paths = resolveTandemPaths({ TANDEM_ENGINE_PORT: "39731" }, "linux");
  assert.equal(paths.enginePort, 39731);
  assert.equal(paths.panelPort, 39732);
  assert.match(paths.logsDir, /tandem[\\/]+logs$/);
});

test("buildEngineServiceDefinition emits platform-specific artifacts", () => {
  const linux = buildEngineServiceDefinition(
    resolveTandemPaths({ TANDEM_STATE_DIR: "/tmp/tandem" }, "linux"),
    { USER: "tandem" }
  );
  assert.equal(linux.manager, "systemd");
  assert.equal(linux.unitName, "tandem-engine.service");
  assert.match(linux.content, /--state-dir/);
});

test("findCommandOnPath ignores missing commands", () => {
  assert.equal(findCommandOnPath("definitely-not-a-real-command"), "");
});
