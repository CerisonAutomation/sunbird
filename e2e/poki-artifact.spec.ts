import { createServer, type Server } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { SunbirdPage } from "./SunbirdPage";

/**
 * The artifact contract test: it loads the SHIPPING folder (`poki-upload/`) in
 * a real browser, from a plain static server, with the Poki SDK stubbed exactly
 * the way the Inspector injects it — and asserts what the Inspector's Event Log
 * and Warnings tabs look at:
 *
 *   • the game boots and becomes playable (no page errors, no failed requests)
 *   • it asks for NOTHING outside its own folder (Poki's external-resources rule)
 *   • the SDK sequence is the documented one:
 *       init → gameLoadingStart → gameLoadingFinished → gameplayStart/Stop
 *     with `gameLoadingFinished` exactly once and no consecutive duplicate
 *     gameplay phase (the Inspector flags those as "Unexpected Behavior")
 *   • it boots and plays INSIDE a cross-origin iframe, which is where a Poki
 *     game actually runs
 *
 * This is deliberately not a dev-server test: nothing here builds the app, and
 * `dist/` is never involved. If this passes, the folder handed to the Inspector
 * is the thing that passed.
 *
 * Run with: pnpm test:artifact   (after `pnpm build:poki`)
 */
const PORT = 4176;
// ESM (package.json type: module): resolve relative to this file.
const ROOT = path.join(import.meta.dirname, "..", "poki-upload");
const ORIGIN = `http://127.0.0.1:${PORT}`;
const POKI_CDN = /game-cdn\.poki\.com/;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

type Call = { name: string; at: number };

/** Serves the artifact exactly like a static host would — no rewriting, no
 *  build step, no SPA fallback: a missing file must be a real 404. */
function serveArtifact(): Promise<Server> {
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", ORIGIN).pathname);
    const rel = pathname === "/" ? "/index.html" : pathname;
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(`404 ${pathname}`);
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": statSync(file).size,
      "Access-Control-Allow-Origin": "*",
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

/**
 * A faithful stand-in for `https://game-cdn.poki.com/scripts/v2/poki-sdk.js`.
 * The Inspector injects the real one before the bundle runs; `addInitScript`
 * does the same here, and every call lands in `window.__pokiCalls` in order.
 */
const SDK_STUB = `
window.__pokiCalls = [];
window.PokiSDK = (function () {
  function record(name) {
    return function () {
      window.__pokiCalls.push({ name: name, at: Date.now() });
    };
  }
  return {
    init: function () { record("init")(); return Promise.resolve(); },
    setDebug: record("setDebug"),
    gameLoadingStart: record("gameLoadingStart"),
    gameLoadingFinished: record("gameLoadingFinished"),
    gameplayStart: record("gameplayStart"),
    gameplayStop: record("gameplayStop"),
    signalGameReady: record("signalGameReady"),
    movePill: record("movePill"),
    hasAdBlock: function () { record("hasAdBlock")(); return false; },
    getURLParam: function () { record("getURLParam")(); return null; },
    getUser: function () { record("getUser")(); return Promise.resolve({ username: "Inspector QA", isSignedIn: false }); },
    getToken: function () { record("getToken")(); return Promise.resolve("stub-token"); },
    shareableURL: function () { record("shareableURL")(); return Promise.resolve("${ORIGIN}/"); },
    commercialBreak: function (onStart) { record("commercialBreak")(); if (typeof onStart === "function") onStart(); return Promise.resolve(); },
    rewardedBreak: function (onStart) { record("rewardedBreak")(); if (typeof onStart === "function") onStart(); return Promise.resolve(true); }
  };
})();
`;

const callsOf = (page: Page): Promise<Call[]> =>
  page.evaluate(() => (window as unknown as { __pokiCalls?: Call[] }).__pokiCalls ?? []);

let server: Server;

test.beforeAll(async () => {
  server = await serveArtifact();
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(async ({ page }) => {
  // The Inspector injects the SDK before the bundle; serve it (and any CDN
  // fallback fetch) from the stub, so no real network is involved.
  await page.addInitScript(SDK_STUB);
  await page.route(POKI_CDN, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: SDK_STUB }),
  );
});

test("the shipping folder boots, plays, and emits the Poki event contract", async ({ page }) => {
  const external: string[] = [];
  const failed: string[] = [];
  const local: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "data:") return;
    if (url.origin === ORIGIN) local.push(url.pathname);
    else if (!POKI_CDN.test(request.url())) external.push(request.url());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });

  const app = new SunbirdPage(page);
  await app.open();
  await app.ready();

  // What the Inspector's "External Resources" warning looks for.
  expect(external).toEqual([]);
  expect(failed).toEqual([]);
  expect(app.errors).toEqual([]);

  // The artifact is self-contained: one html file, icons served from the folder.
  expect(local).toContain("/index.html");
  expect(local.some((p) => p.startsWith("/icons/"))).toBe(true);

  // A real WebGL canvas, sized — not a placeholder.
  const canvas = await page.locator("canvas").first().evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    return { width: c.width, height: c.height, gl: Boolean(gl) };
  });
  expect(canvas.gl).toBe(true);
  expect(canvas.width).toBeGreaterThan(0);
  expect(canvas.height).toBeGreaterThan(0);

  /* ---------------------------------------------------- SDK event contract */
  const boot = (await callsOf(page)).map((c) => c.name);
  console.log("Poki SDK boot sequence:", boot.join(" → "));

  expect(boot).toContain("init");
  expect(boot).toContain("gameLoadingStart");
  expect(boot).toContain("gameLoadingFinished");
  // Exactly once — the Inspector flags a repeated loading phase.
  expect(boot.filter((n) => n === "gameLoadingFinished").length).toBe(1);
  expect(boot.indexOf("init")).toBeLessThan(boot.indexOf("gameLoadingStart"));
  expect(boot.indexOf("gameLoadingStart")).toBeLessThan(boot.indexOf("gameLoadingFinished"));

  // Flying starts the gameplay phase…
  await app.fly();
  await expect.poll(async () => (await callsOf(page)).map((c) => c.name).includes("gameplayStart")).toBe(true);

  // …and pausing stops it (the state machine is edge-triggered through the
  // GameplayEventSink, so a duplicate phase here would fail).
  await app.pause();
  await expect
    .poll(async () => (await callsOf(page)).filter((c) => c.name === "gameplayStop").length)
    .toBeGreaterThan(0);

  const run = (await callsOf(page)).map((c) => c.name).filter((n) => n === "gameplayStart" || n === "gameplayStop");
  expect(run[0], "the first gameplay event must be a start").toBe("gameplayStart");
  for (let i = 1; i < run.length; i += 1) {
    expect(run[i], "a consecutive duplicate gameplay phase is flagged by the Inspector").not.toBe(run[i - 1]);
  }
});

test("boots and plays inside the cross-origin iframe the Inspector uses", async ({ page }) => {
  await page.setContent(
    `<!doctype html><title>Inspector frame</title><iframe id="game" src="${ORIGIN}/" style="border:0;width:1024px;height:576px"></iframe>`,
    { waitUntil: "load" },
  );
  const game = page.frameLocator("#game");

  // The boot overlay removing itself is the app's own "first playable frame".
  await expect(game.locator("#boot-shell")).toHaveCount(0, { timeout: 60_000 });
  await expect(game.getByRole("button", { name: "Play free flight now", exact: true })).toBeVisible();

  await game.getByRole("button", { name: "Play free flight now", exact: true }).click();
  await expect(game.locator('[data-action="pause"]')).toBeVisible();

  // The stub is injected into the game frame too, and it saw the lifecycle.
  const frame = page.frames().find((f) => f.url().startsWith(ORIGIN));
  expect(frame, "the game frame loaded from the artifact origin").toBeTruthy();
  const played = (await frame!.evaluate(() => (window as unknown as { __pokiCalls?: Call[] }).__pokiCalls ?? [])).map(
    (c) => c.name,
  );
  expect(played).toContain("gameLoadingFinished");
  expect(played).toContain("gameplayStart");
});
