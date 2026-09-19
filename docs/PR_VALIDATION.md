# Current branch validation and handoff

This note supersedes earlier verification counts **for the latest tree**. The earlier audits document intermediate stages; their passing browser runs do not certify the subsequent sunny-theme and Squad changes.

## Latest changes

- Restored the lighter-weight golden SUNBIRD wordmark, yellow launch button and sunnier menu/shop palette; retained canonical sun/bird artwork and illustrated navigation.
- Improved bird eye contrast, subtle skin-colored fill and landing-hint look-ahead without changing the flight integrator.
- Fixed Squad's acknowledged-leave state when reconciliation fails, stale chat errors, stale-club responses and conflicting refreshes.
- Added scroll-aware chat history, editable drafts while requests run, friend-code copying and polling when Squad is opened from a recap.
- Added explicit, consent-gated re-enrollment for a missing Squad key. This creates a **separate social profile**; it neither recovers nor deletes the old social identity and does not reset flight progress. Existing bearer authentication is not bypassed.
- The social chat POST can now return the persisted message for immediate sender feedback; the client retains compatibility with the earlier response shape.
- Moved the desktop hero sun down 8 px to address a previously detected 3 px overlap with the mute button. Browser revalidation of that adjustment is still required.

## Fresh checks before opening the pull request

- TypeScript: passed.
- ESLint: passed.
- Unit suite: **866 tests / 58 files passed**.
- Vite production build: passed. The existing >500 kB chunk advisory remains visible.
- Both Node server syntax checks: passed.
- `git diff --check`: passed.
- Development preview on port 5173: HTTP 200.
- Squad proxy health and multiplayer service health: successful.

## Browser validation limitation

The current sandbox did not retain its Chromium executable. Reinstalling through Playwright failed with a download connection reset (`ECONNRESET`). Consequently, the latest browser suites were **not rerun** before opening the PR.

Earlier, the pre-restoration tree passed 39 production-browser cases and 7 real-service cases. The subsequent sunny-theme run passed phone and short-landscape layout checks but detected the desktop sun/mute overlap described above. New Squad history/re-enrollment integration coverage also needs execution in CI or a browser-equipped environment.

Required follow-up:

```sh
corepack pnpm exec playwright install --with-deps chromium
corepack pnpm test:e2e
corepack pnpm test:e2e:multiplayer
```

The multiplayer suite exercises the Node reference server, not the production Rust server. Seamless race resume, persistent-party rematches, production load testing and social operational recovery remain outside this verification. See the consolidation audit for deployment and legacy authentication migration requirements.
