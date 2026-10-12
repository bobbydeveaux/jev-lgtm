import type { ChangedFile, Chunk } from "./types.js";

// Jev allows 32k tokens for the state plus the longest question. Code tends to
// run at about 3 characters per token, so 48k characters leaves room to spare.
export const MAX_CHUNK_CHARS = 48_000;

/**
 * Splits a file's patch into chunks on hunk boundaries. A single hunk larger
 * than the limit is split on line boundaries.
 */
export function chunkFile(file: ChangedFile, maxChars = MAX_CHUNK_CHARS): Chunk[] {
  const patch = file.patch ?? "";
  const make = (diff: string): Chunk => ({ filename: file.filename, status: file.status, diff });
  if (patch.length <= maxChars) return [make(patch)];

  const hunks = patch.split(/\n(?=@@ )/);
  const chunks: string[] = [];
  let current = "";
  const push = (piece: string) => {
    if (current && current.length + piece.length + 1 > maxChars) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n${piece}` : piece;
  };

  for (const hunk of hunks) {
    if (hunk.length <= maxChars) {
      push(hunk);
      continue;
    }
    for (const line of hunk.split("\n")) push(line.slice(0, maxChars));
  }
  if (current) chunks.push(current);
  return chunks.map(make);
}
