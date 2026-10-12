# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-12

### Added

- First release: a GitHub Action that reviews pull request diffs with Jev (`jev-1.13.0`) and returns LGTM or Review Advised.
- Checks in code for size limits, sensitive paths, unreadable diffs, credential patterns and failed requests.
- Six Jev questions per file: risk score, security-sensitive code, data changes, weakened checks, hard-coded credentials and text aimed at the reviewer.
- A report comment that updates in place, approval on LGTM, and withdrawal of that approval when a later push needs review.
- `npm run try` to run the reviewer locally on any pull request.

[0.1.0]: https://github.com/bobbydeveaux/jev-lgtm/releases/tag/v0.1.0
