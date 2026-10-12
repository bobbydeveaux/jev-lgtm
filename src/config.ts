import * as core from "@actions/core";
import { DEFAULT_SENSITIVE_PATHS } from "./rules.js";
import type { ReviewOptions } from "./types.js";

export interface Config extends ReviewOptions {
  apiKey: string;
  githubToken: string;
  model: string;
  approve: boolean;
}

export function readConfig(): Config {
  const extraPaths = core.getMultilineInput("sensitive-paths").filter((line) => !line.startsWith("#"));
  const defaults = core.getBooleanInput("ignore-default-sensitive-paths") ? [] : DEFAULT_SENSITIVE_PATHS;
  return {
    apiKey: core.getInput("typesafe-api-key", { required: true }),
    githubToken: core.getInput("github-token", { required: true }),
    model: core.getInput("model") || "jev-1.13.0",
    approve: core.getBooleanInput("approve"),
    maxFiles: number("max-files"),
    maxChangedLines: number("max-changed-lines"),
    sensitivePaths: [...defaults, ...extraPaths],
    riskThreshold: number("risk-threshold"),
    flagThreshold: number("flag-threshold"),
    minConfidence: number("min-confidence"),
    concurrency: number("concurrency"),
  };
}

function number(name: string): number {
  const raw = core.getInput(name, { required: true });
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Input "${name}" must be a non-negative number, got "${raw}".`);
  return value;
}
