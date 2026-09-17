# Poki game development tools — extracted reference

Source: <https://developers.poki.com/guide/game-dev-tools>

## Poki Inspector

| ID | Kind | Rule |
|---|---|---|
| `TOOL-01` | informational | The Inspector is a **quality-assurance tool**: it evaluates an uploaded web game against the platform's key success factors. |
| `TOOL-02` | requirement | Test **mobile compatibility** and **technical optimisation** by uploading a web build; the Inspector runs the game (including mobile mode) and flags SDK event sequences, external resources and image weights. |
| `TOOL-03` | requirement | The build must therefore be **uploadable as a folder with `index.html` at the root** and must run correctly when served from an arbitrary sub-path inside the Inspector's mobile frame. |

## Poki Networking Library (Netlib)

| ID | Kind | Rule |
|---|---|---|
| `TOOL-04` | informational | Netlib is a **peer-to-peer library using WebRTC datachannels** to give players direct connections. It exists to make WebRTC tractable for web games — the guide compares it in spirit to the Steam Networking Library. |
| `TOOL-05` | informational | Netlib is available **whether or not the game is hosted on Poki** — it is not a hosting lock-in. |
| `TOOL-06` | requirement | If the game uses it: WebRTC support must be feature-detected, and a non-WebRTC path must exist for players/browsers without it. |

## Arbitrary User Data Store (AUDS)

| ID | Kind | Rule |
|---|---|---|
| `TOOL-07` | informational | AUDS is a **prototype backend service** for storing user-generated content such as levels or leaderboard data. It generates **shareable codes** for stored data, which enables features such as **non-real-time multiplayer**. |
| `TOOL-08` | informational | AUDS is currently **exclusive to games hosted on the Poki platform** (`auds.poki.io/v0/<game-id>/…`), so it cannot be a dependency of a build that must also ship to other portals. |

## How Sunbird applies this page

| Rule | Implementation |
|---|---|
| `TOOL-01`–`TOOL-03` | `pnpm build:poki` produces `dist-poki/`, and `packages-portal.mjs` zips it with `index.html` at the root, relative-only references and no manifest link. `pnpm verify:portals` + `pnpm audit:zips` assert every property the Inspector checks. Nothing in the build requires a sub-path assumption. |
| `TOOL-04`–`TOOL-06` | The Poki build ships **single-player first**; multiplayer for portal builds is an explicitly gated transport behind `navigator` WebRTC detection (`src/game/Realtime.ts` picks P2P only when the platform is Poki *and* WebRTC is available, otherwise WebSocket/local). The Netlib client exists behind a code-split so its weight never lands in the initial download. |
| `TOOL-07`, `TOOL-08` | AUDS is **not** wired into the shipped build: it needs a live Poki game id and is platform-exclusive, which would break the generic/itch artifacts. The deferral is recorded in `ROADMAP.md`; the leaderboard/ghost seams are already shaped so AUDS can be dropped in post-launch without touching game code. |
