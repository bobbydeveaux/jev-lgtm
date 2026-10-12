import type { ReviewResult } from "./types.js";

export const MARKER = "<!-- jev-lgtm -->";

const escapeCell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function renderReport(result: ReviewResult, headSha: string): string {
  const lines = [MARKER];
  if (result.verdict === "LGTM") {
    lines.push("## ✅ LGTM", "", "Jev found nothing in this pull request that needs a human to look at it.");
  } else {
    lines.push("## 🔍 Review Advised", "", "A human should read this pull request before it merges.");
  }

  if (result.reasons.length > 0) {
    lines.push("", ...result.reasons.map((reason) => `- ${reason}`));
  }

  if (result.files.length > 0) {
    lines.push("", "| File | Risk | Notes |", "| --- | --- | --- |");
    const sorted = [...result.files].sort((a, b) => b.reasons.length - a.reasons.length || (b.risk ?? 0) - (a.risk ?? 0));
    for (const file of sorted) {
      const risk = file.risk === undefined ? "–" : `${file.risk.toFixed(1)}/3`;
      const notes = file.reasons.length > 0 ? file.reasons.map(escapeCell).join("<br>") : "–";
      lines.push(`| \`${escapeCell(file.filename)}\` | ${risk} | ${notes} |`);
    }
  }

  const footer = [`Commit ${headSha.slice(0, 7)}`];
  if (result.model) footer.push(`model \`${result.model}\``);
  if (result.inputTokens > 0) footer.push(`${result.inputTokens.toLocaleString("en-US")} input tokens`);
  lines.push(
    "",
    `<sub>${footer.join(" · ")} · [jev-lgtm](https://github.com/bobbydeveaux/jev-lgtm) gives probabilities, not guarantees.</sub>`,
  );
  return lines.join("\n");
}
