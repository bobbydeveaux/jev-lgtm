import { chunkFile } from "./chunk.js";
import { FLAG_KEYS, FLAG_LABELS, RISK_LEVELS } from "./questions.js";
import { changedLines, findSecrets, sensitiveMatch } from "./rules.js";
import type { Assess, Assessment, ChangedFile, FileResult, ReviewOptions, ReviewResult } from "./types.js";

/**
 * Reviews a pull request's changed files. The verdict is "LGTM" only when no
 * hard rule fired and every chunk Jev assessed came back low-risk, unflagged,
 * and confident. Anything else, including a failed Jev call, is "Review Advised".
 */
export async function review(files: ChangedFile[], options: ReviewOptions, assess: Assess): Promise<ReviewResult> {
  const reasons: string[] = [];
  const lines = changedLines(files);

  if (files.length === 0) reasons.push("The pull request has no changed files to assess.");
  if (files.length > options.maxFiles) {
    reasons.push(`${files.length} files changed, over the limit of ${options.maxFiles}.`);
  }
  if (lines > options.maxChangedLines) {
    reasons.push(`${lines} lines changed, over the limit of ${options.maxChangedLines}.`);
  }
  // Too big to send: say why without spending API calls on a foregone verdict.
  if (reasons.length > 0) {
    return { verdict: "Review Advised", reasons, files: [], inputTokens: 0 };
  }

  let model: string | undefined;
  let inputTokens = 0;

  const results = await mapLimit(files, options.concurrency, async (file): Promise<FileResult> => {
    const fileReasons: string[] = [];
    const sensitive = sensitiveMatch(file.filename, options.sensitivePaths);
    if (sensitive) fileReasons.push(`Matches sensitive path \`${sensitive}\``);
    if (!file.patch) {
      if (file.additions + file.deletions > 0 || file.status !== "renamed") {
        fileReasons.push("No text diff available (binary or too large), so Jev could not read it");
      }
      return { filename: file.filename, reasons: fileReasons };
    }
    for (const secret of findSecrets(file.patch)) fileReasons.push(`Added line looks like a ${secret}`);

    let risk: number | undefined;
    for (const chunk of chunkFile(file)) {
      let assessment: Assessment;
      try {
        assessment = await assess(chunk);
      } catch (error) {
        fileReasons.push(`Jev request failed: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      model ??= assessment.model;
      inputTokens += assessment.inputTokens;
      risk = Math.max(risk ?? 0, assessment.risk);
      fileReasons.push(...judge(assessment, options));
    }
    return { filename: file.filename, risk, reasons: [...new Set(fileReasons)] };
  });

  const flagged = results.some((file) => file.reasons.length > 0);
  return { verdict: flagged ? "Review Advised" : "LGTM", reasons, files: results, model, inputTokens };
}

/** Turns one chunk's answers into reasons for review; an empty list means it passed. */
export function judge(assessment: Assessment, options: ReviewOptions): string[] {
  const reasons: string[] = [];
  if (assessment.risk >= options.riskThreshold) {
    const level = RISK_LEVELS[Math.min(RISK_LEVELS.length - 1, Math.round(assessment.risk))];
    reasons.push(`Risk ${assessment.risk.toFixed(1)}/3: ${level}`);
  } else if (assessment.riskConfidence < options.minConfidence) {
    reasons.push(
      `Jev was unsure about the risk (confidence ${assessment.riskConfidence.toFixed(2)}, minimum ${options.minConfidence})`,
    );
  }
  for (const key of FLAG_KEYS) {
    const p = assessment.flags[key];
    if (p >= options.flagThreshold) reasons.push(`${FLAG_LABELS[key]} (p=${p.toFixed(2)})`);
  }
  return reasons;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
