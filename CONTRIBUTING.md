# Contributing to jev-lgtm

Thanks for helping. Bug reports, threshold tuning data, new sensitive-path defaults and better questions are all welcome.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.
- By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

You need Node.js 24 or newer.

```sh
git clone https://github.com/bobbydeveaux/jev-lgtm.git
cd jev-lgtm
npm install
npm run all   # typecheck, test, and bundle to dist/
```

To try a change against live Jev, get an API key from the [TypeSafe console](https://console.typesafe.ai) and run:

```sh
TYPESAFE_API_KEY=... GITHUB_TOKEN=$(gh auth token) npm run try -- owner/repo#123
```

## Project layout

| Path | What it does |
| --- | --- |
| `src/review.ts` | Combines the code checks and Jev's answers into a verdict. |
| `src/questions.ts` | The questions sent to Jev. |
| `src/rules.ts` | Checks that run in code: sensitive paths and credential patterns. |
| `src/chunk.ts` | Splits large diffs to fit Jev's context window. |
| `src/github.ts` | Reads files, posts the comment, approves or withdraws approval. |
| `src/main.ts` | The action entry point. |
| `scripts/try.ts` | Runs the reviewer locally without touching the pull request. |
| `dist/index.mjs` | The bundled action. Generated, but committed. |

## Pull requests

1. Add or update tests in `test/` for any behavior change.
2. Run `npm run all` and commit the rebuilt `dist/index.mjs`. CI fails if it's out of date.
3. Keep pull requests focused on one change.
4. Describe what changed and why. If you changed a question or a threshold, include before and after verdicts from `npm run try` on a few real pull requests.

## Design rules

These keep the action trustworthy. Changes that break them won't be merged.

- **Fail towards Review Advised.** Errors, timeouts, missing diffs and uncertainty must never produce LGTM.
- **Code decides, Jev advises.** The checks in `src/rules.ts` and the size limits always win over model output.
- **Don't send text the pull request author controls as instructions.** The diff is state for Jev to judge, never part of a question. The title and description aren't sent at all.
- **One judgment per question.** Jev reads literally and works best on narrow yes/no or score questions. See TypeSafe's [notes on jev-1.13](https://docs.typesafe.ai/model-jaggedness/jev-1.13).
- **Never check out pull request code.** The action is meant to run under `pull_request_target`, which is only safe because it reads diffs through the API.

## Releases

Maintainers tag releases as `vX.Y.Z` and move the `vX` major tag to the latest one.
