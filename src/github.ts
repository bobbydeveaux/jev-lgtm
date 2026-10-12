import * as core from "@actions/core";
import type * as github from "@actions/github";
import { MARKER } from "./report.js";
import type { ChangedFile, Verdict } from "./types.js";

type Octokit = ReturnType<typeof github.getOctokit>;

export interface PullRef {
  owner: string;
  repo: string;
  number: number;
  headSha: string;
}

export async function listFiles(octokit: Octokit, pr: PullRef): Promise<ChangedFile[]> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner: pr.owner,
    repo: pr.repo,
    pull_number: pr.number,
    per_page: 100,
  });
  return files.map(({ filename, status, additions, deletions, patch }) => ({
    filename,
    status,
    additions,
    deletions,
    patch,
  }));
}

/** Creates the report comment, or updates the one from an earlier run. */
export async function upsertComment(octokit: Octokit, pr: PullRef, body: string): Promise<string> {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner: pr.owner,
    repo: pr.repo,
    issue_number: pr.number,
    per_page: 100,
  });
  const existing = comments.find((comment) => comment.user?.type === "Bot" && comment.body?.startsWith(MARKER));
  const { data } = existing
    ? await octokit.rest.issues.updateComment({ owner: pr.owner, repo: pr.repo, comment_id: existing.id, body })
    : await octokit.rest.issues.createComment({ owner: pr.owner, repo: pr.repo, issue_number: pr.number, body });
  return data.html_url;
}

/**
 * On LGTM, approves the head commit. On Review Advised, withdraws any approval
 * this action gave an earlier commit, so a stale approval never outlives the
 * code it was given for.
 */
export async function applyVerdict(octokit: Octokit, pr: PullRef, verdict: Verdict, commentUrl: string): Promise<void> {
  const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
    owner: pr.owner,
    repo: pr.repo,
    pull_number: pr.number,
    per_page: 100,
  });
  const ours = reviews.filter((review) => review.user?.type === "Bot" && review.body?.includes(MARKER));
  const approvals = ours.filter((review) => review.state === "APPROVED");

  if (verdict === "LGTM") {
    if (approvals.some((review) => review.commit_id === pr.headSha)) return;
    try {
      await octokit.rest.pulls.createReview({
        owner: pr.owner,
        repo: pr.repo,
        pull_number: pr.number,
        commit_id: pr.headSha,
        event: "APPROVE",
        body: `${MARKER}\nLGTM from Jev. [Details](${commentUrl})`,
      });
    } catch (error) {
      core.warning(
        `Could not approve the pull request: ${message(error)}. If you use GITHUB_TOKEN, enable "Allow GitHub Actions to create and approve pull requests" under Settings → Actions → General.`,
      );
    }
    return;
  }

  // The latest non-comment review is what GitHub counts, so if dismissal is not
  // allowed (e.g. protected branch restrictions) a "request changes" review
  // replaces the approval instead.
  const latest = ours.filter((review) => review.state !== "COMMENTED" && review.state !== "DISMISSED").at(-1);
  if (latest?.state !== "APPROVED") return;
  const note = `Jev now advises a human review of ${pr.headSha.slice(0, 7)}, so this earlier approval no longer applies.`;
  for (const review of approvals) {
    try {
      await octokit.rest.pulls.dismissReview({
        owner: pr.owner,
        repo: pr.repo,
        pull_number: pr.number,
        review_id: review.id,
        message: note,
      });
    } catch (error) {
      core.warning(`Could not dismiss approval ${review.id}: ${message(error)}. Requesting changes instead.`);
      await octokit.rest.pulls.createReview({
        owner: pr.owner,
        repo: pr.repo,
        pull_number: pr.number,
        commit_id: pr.headSha,
        event: "REQUEST_CHANGES",
        body: `${MARKER}\n${note} [Details](${commentUrl})`,
      });
      return;
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
