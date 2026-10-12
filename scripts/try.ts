// Runs the reviewer against real pull requests from your terminal, without
// commenting or approving anything:
//
//   TYPESAFE_API_KEY=... GITHUB_TOKEN=$(gh auth token) npm run try -- owner/repo#123 [more...]
import * as github from "@actions/github";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { listFiles } from "../src/github.js";
import { jevAssessor } from "../src/jev.js";
import { renderReport } from "../src/report.js";
import { review } from "../src/review.js";
import { DEFAULT_SENSITIVE_PATHS } from "../src/rules.js";

const refs = process.argv.slice(2);
if (refs.length === 0) {
  console.error("Usage: npm run try -- owner/repo#123 [owner/repo#456 ...]");
  process.exit(1);
}

const octokit = github.getOctokit(process.env.GITHUB_TOKEN ?? "");
const client = new TypeSafeClient({ defaultModel: process.env.JEV_MODEL ?? "jev-1.13.0" });

for (const ref of refs) {
  const match = /^([^/]+)\/([^#]+)#(\d+)$/.exec(ref);
  if (!match) throw new Error(`Not a pull request reference: ${ref}`);
  const [, owner, repo, number] = match as unknown as [string, string, string, string];
  const { data: pull } = await octokit.rest.pulls.get({ owner, repo, pull_number: Number(number) });
  const pr = { owner, repo, number: pull.number, headSha: pull.head.sha };

  const started = Date.now();
  const result = await review(await listFiles(octokit, pr), {
    maxFiles: 50,
    maxChangedLines: 1000,
    sensitivePaths: DEFAULT_SENSITIVE_PATHS,
    riskThreshold: 1.5,
    flagThreshold: 0.5,
    minConfidence: 0.4,
    concurrency: 8,
  }, jevAssessor(client));

  console.log(`\n===== ${ref}: ${pull.title} (${Date.now() - started} ms) =====\n`);
  console.log(renderReport(result, pr.headSha));
}
