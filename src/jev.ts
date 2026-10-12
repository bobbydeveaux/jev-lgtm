import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { QUESTIONS } from "./questions.js";
import type { Assess } from "./types.js";

/** Asks Jev every question about one chunk in a single request. */
export function jevAssessor(client: TypeSafeClient): Assess {
  return async (chunk) => {
    const { answers, model, usage } = await client.systemOne({
      state: { file: chunk.filename, change: chunk.status, diff: chunk.diff },
      questions: QUESTIONS,
    });
    return {
      risk: answers.risk.score,
      riskConfidence: answers.risk.confidence,
      flags: {
        security: answers.security.noul,
        data: answers.data.noul,
        weakens: answers.weakens.noul,
        secret: answers.secret.noul,
        addressed: answers.addressed.noul,
      },
      model,
      inputTokens: usage.input_tokens,
    };
  };
}
