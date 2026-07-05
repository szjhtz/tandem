import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts/extract-release-notes.js");

function withFixture(files, callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tandem-release-notes-"));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = path.join(dir, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }
    return callback(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runExtractor(fixtureRoot, tag) {
  return spawnSync(process.execPath, [scriptPath, tag], {
    cwd: repoRoot,
    env: {
      ...process.env,
      RELEASE_NOTES_REPO_ROOT: fixtureRoot,
    },
    encoding: "utf8",
  });
}

test("extracts structured finalized release notes", () => {
  withFixture(
    {
      "RELEASE_NOTES.md": `# Release Notes

## v1.2.3 (2026-07-05)

Short focused summary.

### Highlights

- One useful thing.
- Another useful thing.
`,
    },
    (fixtureRoot) => {
      const result = runExtractor(fixtureRoot, "v1.2.3");

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /See the assets below/);
      assert.match(result.stdout, /## v1\.2\.3 \(2026-07-05\)/);
      assert.match(result.stdout, /### Highlights/);
    }
  );
});

test("rejects release notes still marked Unreleased", () => {
  withFixture(
    {
      "RELEASE_NOTES.md": `# Release Notes

## v1.2.3 (Unreleased)

- Still not finalized.
`,
    },
    (fixtureRoot) => {
      const result = runExtractor(fixtureRoot, "v1.2.3");

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /still marked "Unreleased"/);
    }
  );
});

test("rejects long release notes without readable structure", () => {
  const wallOfText = Array.from(
    { length: 520 },
    (_, index) => `word${index}`
  ).join(" ");

  withFixture(
    {
      "RELEASE_NOTES.md": `# Release Notes

## v1.2.3 (2026-07-05)

${wallOfText}
`,
    },
    (fixtureRoot) => {
      const result = runExtractor(fixtureRoot, "v1.2.3");

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /without section headings or a bullet list/);
    }
  );
});
