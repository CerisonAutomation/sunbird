**Multiplayer:** the Rust `sunbird-server` owns the WebSocket room protocol
(`GET /ws`, 15 Hz state, server-refereed finishes). It is **live on a GCP
free-tier VM**:

- Host: `sunbird-mp` — e2-micro, `us-central1-a`, Ubuntu 24.04, 30 GB
  standard disk, 4 GB swap (e2-micro has 1 GB RAM), external IP
  `34.123.76.46`, running as a hardened systemd unit (`User=nobody`,
  `MemoryMax=700M`, restart-on-failure). Always-free eligible.
- Endpoint: `ws://34.123.76.46:8080/ws` — two-client join/welcome/peers/
  start smoke-tested against the live VM.
- Redeploy after server changes: `bash rust/deploy/gcloud/deploy.sh`
  (cross-compiles for linux/amd64 in Docker, ships, restarts the service).

**TLS note:** pages served over HTTPS (portals, Vercel) cannot open a plain
`ws://` connection (mixed content). Portals currently build with
`VITE_MULTIPLAYER_URL=` (solo field, honestly labelled) until a domain is
pointed at the VM. To enable `wss://`: add an `A` record for your domain →
`34.123.76.46`, then give Caddy (already installed on the VM) a one-line
Caddyfile — it mints the Let's Encrypt cert automatically:
```
mp.yourdomain.com {
    reverse_proxy /ws localhost:8080
}
and set `VITE_MULTIPLAYER_URL=wss://mp.yourdomain.com` in the build env.
For any other host, the manual equivalent is still:
```bash
cargo build --release -p sunbird-server
./target/release/sunbird-server   # serves GET /ws on :8080
```

## 5. Stripe webhook entitlements (server-authoritative purchases)

The backend ships a verified webhook route — `POST /stripe/webhook` — so paid
entitlements are owned by the server, not by a client-side "I paid" button
(closes REPO_TRUTH_AUDIT #12).

Setup (once, ~5 minutes):

```bash
# 1. Give the worker the webhook signing secret (whsec_…):
cd backend && npx wrangler secret put STRIPE_WEBHOOK_SECRET

# 2. In the Stripe dashboard, add a webhook endpoint pointed at
#    https://<your-worker>.workers.dev/stripe/webhook
#    listening for: checkout.session.completed
```

How it works end to end:

1. The game opens your Payment Link with `client_reference_id=<deviceId>`
   (already wired in `Payments.ts`).
2. Stripe calls the webhook; the worker verifies the `Stripe-Signature`
   header (HMAC-SHA256 over `t.rawBody`, 5-minute replay window — see
   `backend/src/entitlements.ts`, pinned by `entitlements.test.ts`).
3. `amount_total` maps to the SKU: 299→gold, 199→vip, 99→starter. The grant
   is stored per deviceId in the leaderboard DO.
4. The game syncs on Stripe return + on "Restore purchases" via
   `GET /entitlements?device=…` and grants with source `stripe_webhook`.

Unset secret ⇒ the endpoint answers 503 and the game falls back to the
labelled manual-confirm flow, exactly as before. If you change prices in
Stripe, update `AMOUNT_TO_SKU` in `backend/src/entitlements.ts`.
# Performance & the infinite world

Measured, not estimated. Everything below comes from `src/game/__tests__/terrain-streaming.test.ts`,
which runs **headless**: `BufferGeometry` works in node without a GL context, so these numbers
are the real code path, not a stand-in.

## What was measured

A 20 km flight at ~4 units per frame (≈100 u/s at 60 fps), driven through `TerrainSystem.update()`:

| | before | after | change |
| --- | --- | --- | --- |
| `Float32Array` allocations | 5,659 | **1,195** | **−79%** |
| bytes of garbage | 12.0 MB | **0.4 MB** | **−97%** |
| geometry `dispose()` calls | 2,097 | **0** | **−100%** |

Allocation is what causes GC stutter that grows with flight length, and in an endless runner the
flight length is unbounded — so this is the metric that matters, not a one-off frame time.

## Where the churn actually was

The first guess was wrong, and measuring is what caught it. Instrumenting the allocation sites
rather than reasoning about them gave:

| allocations | site |
| --- | --- |
| 3,640 (75%) | `rebuildFar` — the four parallax layers, rebuilt every 40 units |
| 924 | `emit` — per-chunk deco `InstancedMesh` buffers |
| 84 | `placeSunflowers` |
| 60 | `spawnChunk` (pool warmup) |

So the dominant cost was **not** the terrain chunks. Two changes:

### 1. `rebuildFar` now rewrites in place

It disposed and rebuilt all four geometries on every call, and called `computeVertexNormals()`
per layer per call. The topology is fixed at `FAR_SAMPLES = 120`, so the buffers and index are
built **once** in the constructor and only the heights are rewritten now.

`computeVertexNormals()` was also pure waste: `farMats` are `MeshBasicMaterial`, which never reads
normals — and `frustumCulled` is already `false` on those meshes, so no bounding sphere is needed
either.

### 2. Chunk geometry is pooled

`spawnChunk` allocated three `Float32Array`s, a growing `number[]` index and a `BufferGeometry`
per chunk, and disposed them on eviction. Buffers now come from a free-list
(`GEO_POOL_MAX = 24`, sized to the 19-chunk visible window plus slack) and are rewritten in place.
The index also became a `Uint16Array` — 164 verts is far under the 65536 ceiling, and it halves
the buffer the old `number[]`/`setIndex` path produced. Six scratch `THREE.Color` objects that
were allocated per chunk are instance fields now.

## Correctness is pinned, not assumed

Pooling rewrites shared buffers, so a bug here would corrupt the world rather than just slow it
down. `terrain-streaming.test.ts` asserts:

- pooled chunk vertices still sit **exactly** on `heightAt(x)` after being rewritten, and the
  index count and Uint16 range are right;
- the far layers keep the *same* geometry object and the *same* underlying array across a
  5,000-unit jump (proof of in-place update), and really did follow the camera;
- the number of distinct chunk geometries over 20 km stays bounded (≤ 60) instead of growing.

Mutation-checked: forcing `releaseBuffers` to dispose instead of pool fails **3** of the 5 tests.
Restored, all 5 pass.

## Research that did *not* apply

Checked against the code rather than adopted on reputation:

- **"Use indexed geometry — check custom procedural geometry."** Already done: `buildChunkGeo`
  called `geo.setIndex(...)`. No win available.
- **"Use InstancedMesh for repeated geometry."** Already done for coins/gems/rings
  (`Collectibles.ts`) and the background flock (`LivingBackground.ts`, one `InstancedMesh` each).
- **"Enable frustum culling."** On by default and already relied on; the far layers are
  deliberately exempt.

## Remaining opportunities, in priority order

1. **Pool the deco `InstancedMesh` buffers** — 924 of the remaining 1,195 allocations. Each chunk
   builds fresh instanced meshes in `placeDecor`'s `emit` closure. Bigger refactor (pooling per
   deco part, not per chunk), so it was left rather than half-done.
2. **Draw-call budget** — the research consistently says budget ~100 draw calls on mobile and
   measure with `renderer.info.render.calls`. This repo has never measured it. Add a dev overlay
   or a CI-assertable count; without a number, "reduce draw calls" is not actionable.
3. **LOD on chunks** — `CHUNK_RES = 1.8` is constant for all 19 live chunks. The 14 forward chunks
   are distant; coarsening resolution with distance is the single biggest remaining geometry win
   and is cited as 2–5× on FPS. Needs care: `heightAt` is shared with gameplay collision, so only
   the *mesh* may be coarsened, never the height field.
4. **Shadows** — `castShadow`/`receiveShadow` are on for every terrain chunk against a 1024² map.
   Worth gating by quality tier on mobile.
5. **Pixel ratio cap** — research says `Math.min(devicePixelRatio, 2)`; verify `preferredDpr()`
   actually caps there on 3× phones.

## What is *not* verified

There is no browser or GPU in this sandbox, so **no frame time or FPS number appears above on
purpose** — there is nothing to measure it with. The allocation counts are real and headless;
the frame-rate effect of removing them is an inference, not a measurement. Confirm on a real
device with the Performance panel before claiming an FPS figure.
# Production Readiness Plan — Multi-App Audit & Monitoring

## Apps Under Management

| App | Repo | Stack | Status |
|-----|------|-------|--------|
| **Sunbird** | CerisonAutomation/sunbird | React + Three.js + Vite | ✅ Deployed |
| **FYK Consolidated** | CerisonAutomation/fyk-consolidated | React + Vite + Prisma + Supabase | 🔄 Audit pending |
| **Arena AI Agents** | arena.ai/agent/* | Arena platform | 🔄 Monitor |

## Automated Monitoring Schedule

### Every 15 Minutes (Cron)
- Build verification (typecheck + test + build)
- Production URL health check
- Security header validation
- Performance metrics

### Every Hour
- Full codebase audit (security, performance, bugs)
- Dependency vulnerability scan
- Test coverage analysis

### Daily
- Complete production readiness report
- Arena AI agent status check
- Deployment verification

## Production Standards

### Code Quality
- [ ] 0 TypeScript errors
- [ ] 100% test pass rate
- [ ] Build time < 30s
- [ ] Bundle size < 2MB

### Security
- [ ] CSP headers (no unsafe-inline)
- [ ] HTTPS enforced
- [ ] No exposed secrets
- [ ] Input validation on all endpoints

### Performance
- [ ] First Contentful Paint < 1.5s
- [ ] Largest Contentful Paint < 2.5s
- [ ] Time to Interactive < 3.5s
- [ ] No memory leaks

### Reliability
- [ ] Error boundaries on all pages
- [ ] Graceful degradation
- [ ] Offline support (PWA)
- [ ] Auto-recovery from failures

## Monitoring Actions

1. **Health Check**: Verify production URLs return 200
2. **Build Check**: Run typecheck + test + build
3. **Security Check**: Validate CSP, headers, no secrets
4. **Performance Check**: Lighthouse scores, Core Web Vitals
5. **Dependency Check**: npm audit, outdated packages
6. **Arena Check**: Agent status, response quality

## Escalation

- **Critical**: immediate notification
- **High**: within 1 hour
- **Medium**: within 4 hours
- **Low**: next daily report
