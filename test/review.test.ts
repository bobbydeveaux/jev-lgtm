import { describe, expect, it, vi } from "vitest";
import { chunkFile } from "../src/chunk.js";
import { renderReport } from "../src/report.js";
import { review } from "../src/review.js";
import { DEFAULT_SENSITIVE_PATHS, findSecrets, sensitiveMatch } from "../src/rules.js";
import type { Assessment, ChangedFile, ReviewOptions } from "../src/types.js";

const options: ReviewOptions = {
  maxFiles: 50,
  maxChangedLines: 1000,
  sensitivePaths: DEFAULT_SENSITIVE_PATHS,
  riskThreshold: 1.5,
  flagThreshold: 0.5,
  minConfidence: 0.4,
  concurrency: 4,
};

const file = (overrides: Partial<ChangedFile> = {}): ChangedFile => ({
  filename: "src/greeting.ts",
  status: "modified",
  additions: 1,
  deletions: 1,
  patch: "@@ -1 +1 @@\n-export const hi = 'helo';\n+export const hi = 'hello';",
  ...overrides,
});

// Fake credentials, assembled at runtime so secret scanners don't flag this file.
const FAKE_AWS_KEY = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
const FAKE_STRIPE_KEY = ["rk", "live", "51Hq8sKJx0aZbQ2vX9nTt4LmPq7Rw"].join("_");

const calm = (overrides: Partial<Assessment> = {}): Assessment => ({
  risk: 0.3,
  riskConfidence: 0.9,
  flags: { security: 0.02, data: 0.01, weakens: 0.03, secret: 0.0, addressed: 0.0 },
  model: "jev-1.13.0",
  inputTokens: 400,
  ...overrides,
});

describe("review", () => {
  it("is LGTM when every chunk is low risk, confident, and unflagged", async () => {
    const result = await review([file()], options, async () => calm());
    expect(result.verdict).toBe("LGTM");
    expect(result.model).toBe("jev-1.13.0");
    expect(result.inputTokens).toBe(400);
  });

  it("advises review when the risk score crosses the threshold", async () => {
    const result = await review([file()], options, async () => calm({ risk: 2.2 }));
    expect(result.verdict).toBe("Review Advised");
    expect(result.files[0]!.reasons[0]).toMatch(/^Risk 2\.2\/3/);
  });

  it("advises review when Jev is unsure, even if the score is low", async () => {
    const result = await review([file()], options, async () => calm({ riskConfidence: 0.2 }));
    expect(result.verdict).toBe("Review Advised");
    expect(result.files[0]!.reasons[0]).toMatch(/unsure/);
  });

  it("advises review when any yes/no concern is likely", async () => {
    const result = await review([file()], options, async () =>
      calm({ flags: { security: 0.01, data: 0.01, weakens: 0.01, secret: 0.01, addressed: 0.91 } }),
    );
    expect(result.verdict).toBe("Review Advised");
    expect(result.files[0]!.reasons).toEqual(["Contains text aimed at the reviewer (possible prompt injection) (p=0.91)"]);
  });

  it("treats a failed Jev call as Review Advised, never LGTM", async () => {
    const result = await review([file()], options, async () => {
      throw new Error("529 Overloaded");
    });
    expect(result.verdict).toBe("Review Advised");
    expect(result.files[0]!.reasons).toEqual(["Jev request failed: 529 Overloaded"]);
  });

  it("skips Jev entirely for pull requests over the size limits", async () => {
    const assess = vi.fn(async () => calm());
    const result = await review([file({ additions: 900, deletions: 200 })], options, assess);
    expect(result.verdict).toBe("Review Advised");
    expect(result.reasons).toEqual(["1100 lines changed, over the limit of 1000."]);
    expect(assess).not.toHaveBeenCalled();
  });

  it("advises review for an empty pull request", async () => {
    expect((await review([], options, async () => calm())).verdict).toBe("Review Advised");
  });

  it("flags sensitive paths and unreadable files even when Jev is calm", async () => {
    const files = [
      file({ filename: ".github/workflows/deploy.yml" }),
      file({ filename: "assets/logo.png", patch: undefined, additions: 0, deletions: 0, status: "added" }),
    ];
    const result = await review(files, options, async () => calm());
    expect(result.verdict).toBe("Review Advised");
    expect(result.files[0]!.reasons).toEqual(["Matches sensitive path `.github/**`"]);
    expect(result.files[1]!.reasons[0]).toMatch(/No text diff/);
  });

  it("does not flag a pure rename with no content change", async () => {
    const result = await review(
      [file({ status: "renamed", patch: undefined, additions: 0, deletions: 0 })],
      options,
      async () => calm(),
    );
    expect(result.verdict).toBe("LGTM");
  });

  it("finds credentials on added lines in code, without asking Jev", async () => {
    const patch = `@@ -1 +1,2 @@\n const a = 1;\n+const key = '${FAKE_AWS_KEY}';`;
    const result = await review([file({ patch })], options, async () => calm());
    expect(result.files[0]!.reasons).toContain("Added line looks like a AWS access key");
  });
});

describe("rules", () => {
  it("matches dotfiles and nested dependency manifests", () => {
    expect(sensitiveMatch("packages/api/package.json", DEFAULT_SENSITIVE_PATHS)).toBe("**/package.json");
    expect(sensitiveMatch(".env.production", DEFAULT_SENSITIVE_PATHS)).toBe("**/.env*");
    expect(sensitiveMatch("src/index.ts", DEFAULT_SENSITIVE_PATHS)).toBeUndefined();
  });

  it("finds Stripe live and restricted keys", () => {
    expect(findSecrets(`+const k = "${FAKE_STRIPE_KEY}";`)).toEqual(["Stripe key"]);
  });

  it("ignores credentials on removed lines", () => {
    expect(findSecrets(`-const key = '${FAKE_AWS_KEY}';`)).toEqual([]);
  });
});

describe("chunkFile", () => {
  it("keeps small patches whole", () => {
    expect(chunkFile(file())).toHaveLength(1);
  });

  it("splits large patches on hunk boundaries within the limit", () => {
    const hunk = (n: number) => `@@ -${n} +${n} @@\n${"+x\n".repeat(30)}`.trimEnd();
    const patch = [hunk(1), hunk(50), hunk(100)].join("\n");
    const chunks = chunkFile(file({ patch }), 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.diff.length).toBeLessThanOrEqual(200);
    expect(chunks.map((c) => c.diff).join("\n")).toBe(patch);
  });
});

describe("renderReport", () => {
  it("lists flagged files first and escapes table cells", async () => {
    const result = await review(
      [file({ filename: "a|b.ts" }), file({ filename: "src/auth.ts" })],
      options,
      async (chunk) => (chunk.filename === "src/auth.ts" ? calm({ risk: 2.8 }) : calm()),
    );
    const report = renderReport(result, "0123456789abcdef");
    expect(report).toContain("## 🔍 Review Advised");
    expect(report.indexOf("src/auth.ts")).toBeLessThan(report.indexOf("a\\|b.ts"));
    expect(report).toContain("Commit 0123456");
  });
});
