import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["audit", "--json"], { encoding: "utf8" });
if (!result.stdout) {
  process.stderr.write(result.stderr || "npm audit produced no report\n");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  process.stderr.write("npm audit produced invalid JSON\n");
  process.exit(1);
}

const findings = Object.values(report.vulnerabilities || {}).filter(
  (finding) => finding.severity === "high" || finding.severity === "critical",
);
const allowedNames = new Set([
  "@eslint/config-array",
  "@eslint/eslintrc",
  "@redocly/openapi-core",
  "brace-expansion",
  "eslint",
  "eslint-config-next",
  "eslint-plugin-import",
  "eslint-plugin-jsx-a11y",
  "eslint-plugin-react",
  "fast-uri",
  "js-yaml",
  "minimatch",
  "next",
  "postcss",
  "sharp",
]);
const allowed = findings.every((finding) => allowedNames.has(finding.name));

if (!allowed || findings.length !== allowedNames.size) {
  process.stderr.write(`${JSON.stringify(findings, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write("npm audit: only exact known tooling and Next/sharp high advisory set remains\n");
