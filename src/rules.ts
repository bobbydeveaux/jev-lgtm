import picomatch from "picomatch";
import type { ChangedFile } from "./types.js";

// Checks that run in code and can only push a pull request towards
// "Review Advised". Jev never gets a say over these, so text inside a diff
// can't talk its way past them.

export const DEFAULT_SENSITIVE_PATHS = [
  ".github/**",
  "**/CODEOWNERS",
  "**/migrations/**",
  "**/*.sql",
  "**/Dockerfile",
  "**/*.tf",
  "**/.env*",
  "**/*.pem",
  "**/*.key",
  // Dependency changes: a new package is code nobody on the team wrote.
  "**/package.json",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/requirements*.txt",
  "**/pyproject.toml",
  "**/poetry.lock",
  "**/uv.lock",
  "**/go.mod",
  "**/go.sum",
  "**/Cargo.toml",
  "**/Cargo.lock",
  "**/Gemfile",
  "**/Gemfile.lock",
  "**/composer.json",
  "**/composer.lock",
];

const SECRET_PATTERNS: [string, RegExp][] = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["API secret key", /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}/],
  ["Stripe key", /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/],
];

export function sensitiveMatch(filename: string, patterns: string[]): string | undefined {
  return patterns.find((pattern) => picomatch.isMatch(filename, pattern, { dot: true }));
}

export function findSecrets(patch: string): string[] {
  const added = patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .join("\n");
  return SECRET_PATTERNS.filter(([, re]) => re.test(added)).map(([name]) => name);
}

export function changedLines(files: ChangedFile[]): number {
  return files.reduce((sum, file) => sum + file.additions + file.deletions, 0);
}
