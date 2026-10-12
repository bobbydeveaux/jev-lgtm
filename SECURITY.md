# Security Policy

## Supported versions

Only the latest release of the `v0` major tag receives security fixes.

## Reporting a vulnerability

Please **don't** open a public issue. Report it privately through [GitHub's private vulnerability reporting](https://github.com/bobbydeveaux/jev-lgtm/security/advisories/new).

Include what you found, how to reproduce it, and the impact you expect. You should get a reply within a few days.

## What counts

Because this action can approve pull requests, these are in scope:

- A diff or pull request that gets an LGTM it shouldn't, through prompt injection or any other trick that gets past the checks in code.
- Anything that causes an approval to survive a later push that should have withdrawn it.
- Leaking the TypeSafe API key or GitHub token.
- Any way the action could run code from the pull request it is reviewing.

Ordinary model misjudgments, where Jev rates a risky change as low risk without any manipulation, are better reported as regular issues with an example diff, so the questions and thresholds can be tuned in the open.
