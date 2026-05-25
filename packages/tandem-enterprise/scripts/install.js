const path = require("path");
const { installBinary } = require("./binary-installer");

const config = {
  packageRoot: path.join(__dirname, ".."),
  packageName: "@frumu/tandem-enterprise",
  binaryBaseName: "tandem-engine",
  assetPrefix: "tandem-engine-enterprise-linux-x64",
  archive: "tar.gz",
  userAgent: "tandem-engine-enterprise",
  supported: [{ platform: "linux", arch: "x64" }],
};

if (require.main === module) {
  installBinary(config).catch((err) => {
    const detail = err && err.message ? err.message : String(err);
    console.error(`Error: @frumu/tandem-enterprise could not install tandem-engine: ${detail}`);
    process.exit(1);
  });
}

module.exports = {
  config,
  ...require("./binary-installer"),
};
