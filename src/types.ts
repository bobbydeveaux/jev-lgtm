export type Verdict = "LGTM" | "Review Advised";

/** The subset of a GitHub "list pull request files" entry that the reviewer reads. */
export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  /** GitHub omits the patch for binary files and for very large diffs. */
  patch?: string;
}

export interface ReviewOptions {
  maxFiles: number;
  maxChangedLines: number;
  sensitivePaths: string[];
  riskThreshold: number;
  flagThreshold: number;
  minConfidence: number;
  concurrency: number;
}

/** One piece of a file's diff, small enough to fit Jev's context window. */
export interface Chunk {
  filename: string;
  status: string;
  diff: string;
}

/** Jev's answers for one chunk, flattened into plain numbers. */
export interface Assessment {
  risk: number;
  riskConfidence: number;
  flags: Record<FlagKey, number>;
  model: string;
  inputTokens: number;
}

export type Assess = (chunk: Chunk) => Promise<Assessment>;

export type FlagKey = "security" | "data" | "weakens" | "secret" | "addressed";

export interface FileResult {
  filename: string;
  /** Highest risk across the file's chunks, or undefined when Jev did not assess it. */
  risk?: number;
  reasons: string[];
}

export interface ReviewResult {
  verdict: Verdict;
  /** Reasons that apply to the whole pull request rather than one file. */
  reasons: string[];
  files: FileResult[];
  model?: string;
  inputTokens: number;
}
