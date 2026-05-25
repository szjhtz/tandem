const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync, execSync } = require("child_process");

const DEFAULT_REPO = "frumu-ai/tandem";
const DEFAULT_MIN_SIZE = 1024 * 1024;

const PLATFORM_MAP = {
  win32: { os: "windows", ext: ".exe", archive: "zip" },
  darwin: { os: "darwin", ext: "", archive: "zip" },
  linux: { os: "linux", ext: "", archive: "tar.gz" },
};

const ARCH_MAP = {
  x64: "x64",
  arm64: "arm64",
};

function resolveArtifactInfo(config = {}, runtime = process) {
  const platform = PLATFORM_MAP[runtime.platform];
  const arch = ARCH_MAP[runtime.arch];

  if (!platform || !arch) {
    throw new Error(`Unsupported platform: ${runtime.platform}-${runtime.arch}`);
  }

  if (config.supported) {
    const supported = config.supported.some((entry) => {
      const platformMatches = !entry.platform || entry.platform === runtime.platform;
      const archMatches = !entry.arch || entry.arch === runtime.arch;
      return platformMatches && archMatches;
    });
    if (!supported) {
      throw new Error(`Unsupported platform for ${config.packageName || "this package"}: ${runtime.platform}-${runtime.arch}`);
    }
  }

  const binaryBaseName = config.binaryBaseName || config.assetBaseName || "tandem-engine";
  const binaryName = `${binaryBaseName}${platform.ext}`;
  const archive = config.archive || platform.archive;
  const assetPrefix = config.assetPrefix || `${binaryBaseName}-${platform.os}-${arch}`;
  const artifactName = archive === "zip" ? `${assetPrefix}.zip` : `${assetPrefix}.tar.gz`;

  return {
    artifactName,
    binaryName,
    isWindows: platform.os === "windows",
  };
}

function buildHeaders(userAgent) {
  const headers = { "User-Agent": userAgent };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function parseVersion(raw) {
  const match = String(raw || "").match(/\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/);
  return match ? match[1] : "";
}

function installedBinaryVersion(binaryPath, execFile = execFileSync) {
  if (!fs.existsSync(binaryPath)) return "";
  try {
    const output = execFile(binaryPath, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    return parseVersion(output);
  } catch {
    return "";
  }
}

function shouldDownloadBinary(binaryPath, packageVersion, readVersion = installedBinaryVersion, minSize = DEFAULT_MIN_SIZE) {
  if (!fs.existsSync(binaryPath)) {
    return { download: true, reason: "missing" };
  }

  const stats = fs.statSync(binaryPath);
  if (stats.size < minSize) {
    return { download: true, reason: `too small (${stats.size} bytes)` };
  }

  const installedVersion = readVersion(binaryPath);
  if (!installedVersion) {
    return { download: true, reason: "version check failed" };
  }
  if (installedVersion !== packageVersion) {
    return {
      download: true,
      reason: `version mismatch (${installedVersion} != ${packageVersion})`,
    };
  }

  return { download: false, reason: `version ${installedVersion} already installed` };
}

function fetchJson(url, userAgent) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: buildHeaders(userAgent) }, (res) => {
        if (res.statusCode !== 200) {
          if (res.statusCode === 302 || res.statusCode === 301) {
            return fetchJson(res.headers.location, userAgent).then(resolve).catch(reject);
          }
          return reject(new Error(`GitHub API HTTP ${res.statusCode}`));
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function downloadReleaseAsset({ repo, artifactName, packageVersion, binDir, userAgent }) {
  console.log(`Checking releases for ${repo}...`);
  const releases = await fetchJson(`https://api.github.com/repos/${repo}/releases`, `${userAgent}-installer`);
  const targetTag = `v${packageVersion}`;

  console.log(`Filtering releases for ${repo} (Target: ${targetTag})...`);
  let release = releases.find((r) => r.tag_name === targetTag);

  if (!release) {
    console.warn(`Warning: No release found for tag ${targetTag}. Checking for latest compatible assets...`);
    release = releases.find((r) => r.assets.some((a) => a.name === artifactName));
  }

  if (!release) {
    console.error(`Status: No release found with asset ${artifactName}`);
    console.error("Available assets in latest:", releases[0]?.assets?.map((a) => a.name));
    process.exit(1);
  }

  const asset = release.assets.find((a) => a.name === artifactName);
  if (!asset) {
    throw new Error(`Release ${release.tag_name} does not contain ${artifactName}`);
  }
  console.log(`Downloading ${asset.name} from ${release.tag_name}...`);

  const archivePath = path.join(binDir, artifactName);
  const file = fs.createWriteStream(archivePath);

  return new Promise((resolve, reject) => {
    const request = (url) => {
      https
        .get(url, { headers: buildHeaders(userAgent) }, (res) => {
          if (res.statusCode === 302 || res.statusCode === 301) {
            return request(res.headers.location);
          }
          if (res.statusCode !== 200) return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          res.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve(archivePath);
          });
        })
        .on("error", (err) => {
          fs.unlink(archivePath, () => {});
          reject(err);
        });
    };
    request(asset.browser_download_url);
  });
}

async function extractArchive({ archivePath, artifactName, binDir, destPath, isWindows }) {
  console.log("Extracting...");
  if (isWindows) {
    execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${binDir}' -Force"`);
  } else if (artifactName.endsWith(".zip")) {
    execSync(`unzip -o "${archivePath}" -d "${binDir}"`);
  } else {
    execSync(`tar -xzf "${archivePath}" -C "${binDir}"`);
  }

  fs.unlinkSync(archivePath);

  if (fs.existsSync(destPath)) {
    console.log("Verified binary extracted.");
    if (!isWindows) fs.chmodSync(destPath, 0o755);
    return;
  }

  console.error("Binary not found at expected path:", destPath);
  console.log("Files in bin:", fs.readdirSync(binDir));
  process.exit(1);
}

function warnAndExit(binaryBaseName, err) {
  const detail = err && err.message ? err.message : String(err);
  console.warn(`Warning: ${binaryBaseName} binary download skipped: ${detail}`);
  console.warn(
    `Install completed without a bundled binary. Runtime commands will require a later reinstall or a preinstalled ${binaryBaseName} binary.`
  );
  process.exit(0);
}

async function installBinary(config = {}) {
  const packageInfo = require(path.join(config.packageRoot, "package.json"));
  const repo = config.repo || DEFAULT_REPO;
  const minSize = config.minSize || DEFAULT_MIN_SIZE;
  const binaryBaseName = config.binaryBaseName || "tandem-engine";
  const { artifactName, binaryName, isWindows } = resolveArtifactInfo(config);
  const binDir = path.join(config.packageRoot, "bin", "native");
  const destPath = path.join(binDir, binaryName);

  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const decision = shouldDownloadBinary(destPath, packageInfo.version, installedBinaryVersion, minSize);
  if (!decision.download) {
    console.log(`Binary already present (${decision.reason}).`);
    return;
  }
  if (decision.reason !== "missing") {
    console.log(`Existing binary will be replaced: ${decision.reason}.`);
  }

  const archivePath = await downloadReleaseAsset({
    repo,
    artifactName,
    packageVersion: packageInfo.version,
    binDir,
    userAgent: config.userAgent || binaryBaseName,
  });
  await extractArchive({ archivePath, artifactName, binDir, destPath, isWindows });
}

module.exports = {
  installBinary,
  installedBinaryVersion,
  parseVersion,
  resolveArtifactInfo,
  shouldDownloadBinary,
};
