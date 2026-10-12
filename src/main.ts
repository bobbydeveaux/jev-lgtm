import * as core from "@actions/core";
import * as github from "@actions/github";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { readConfig } from "./config.js";
import { applyVerdict, listFiles, upsertComment, type PullRef } from "./github.js";
import { jevAssessor } from "./jev.js";
import { renderReport } from "./report.js";
import { review } from "./review.js";

async function run(): Promise<void> {
  const config = readConfig();
  core.setSecret(config.apiKey);

  const pull = github.context.payload.pull_request;
  if (!pull) {
    core.setFailed("jev-lgtm runs on pull_request or pull_request_target events.");
    return;
  }
  const pr: PullRef = {
    ...github.context.repo,
    number: pull.number,
    headSha: (pull.head as { sha: string }).sha,
  };

  const octokit = github.getOctokit(config.githubToken);
  const client = new TypeSafeClient({ apiKey: config.apiKey, defaultModel: config.model, timeout: 20_000 });

  const files = await listFiles(octokit, pr);
  core.info(`Reviewing ${files.length} changed files in #${pr.number} with ${config.model}.`);
  const result = await review(files, config, jevAssessor(client));
  core.info(`Verdict: ${result.verdict}`);

  const report = renderReport(result, pr.headSha);
  const commentUrl = await upsertComment(octokit, pr, report);
  if (config.approve) await applyVerdict(octokit, pr, result.verdict, commentUrl);

  core.setOutput("verdict", result.verdict);
  core.setOutput("comment-url", commentUrl);
  await core.summary.addRaw(report).write();
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
