import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const guideRoot = resolve(__dirname, "..")
const repoRoot = resolve(guideRoot, "..")
const publicDir = resolve(guideRoot, "public")

async function readWorkspacePackageVersion() {
  const candidates = [
    resolve(repoRoot, "crates/tandem-server/Cargo.toml"),
    resolve(repoRoot, "packages/tandem-engine/package.json"),
  ]

  for (const candidate of candidates) {
    try {
      const content = await readFile(candidate, "utf8")
      if (candidate.endsWith("package.json")) {
        const parsed = JSON.parse(content)
        if (typeof parsed.version === "string" && parsed.version) {
          return parsed.version
        }
      }
      const versionMatch = content.match(/^version\s*=\s*"([^"]+)"/m)
      if (versionMatch?.[1]) {
        return versionMatch[1]
      }
    } catch {
      // Keep looking. Local docs builds should not fail just because one
      // optional version source is absent.
    }
  }

  return "unknown"
}

const gitSha = process.env.GITHUB_SHA || process.env.DOCS_GIT_SHA || "local"
const gitRef = process.env.GITHUB_REF || process.env.DOCS_GIT_REF || "local"
const gitRefName = process.env.GITHUB_REF_NAME || process.env.DOCS_GIT_REF_NAME || "local"
const repo = process.env.GITHUB_REPOSITORY || process.env.DOCS_REPOSITORY || "frumu-ai/tandem"
const engineVersion = process.env.DOCS_ENGINE_VERSION || await readWorkspacePackageVersion()
const builtAt = new Date().toISOString()

const build = {
  schema_version: 1,
  repo,
  git_sha: gitSha,
  git_short_sha: gitSha === "local" ? "local" : gitSha.slice(0, 12),
  git_ref: gitRef,
  git_ref_name: gitRefName,
  built_at: builtAt,
  engine_version: engineVersion,
  docs_channel: process.env.DOCS_CHANNEL || "stable",
}

const versions = {
  schema_version: 1,
  default_ref: "stable",
  stable: {
    ref: "stable",
    engine_version: engineVersion,
    git_sha: gitSha,
    built_at: builtAt,
  },
  next: {
    ref: "next",
    git_sha: gitSha,
    built_at: builtAt,
  },
}

await mkdir(publicDir, { recursive: true })
await writeFile(resolve(publicDir, "docs-build.json"), `${JSON.stringify(build, null, 2)}\n`)
await writeFile(resolve(publicDir, "docs-versions.json"), `${JSON.stringify(versions, null, 2)}\n`)
