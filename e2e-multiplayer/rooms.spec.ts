import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { SunbirdPage } from "../e2e/SunbirdPage";

type Frame = { type: string; at?: number; seed?: string; pilots?: unknown[] };
function wire(page: Page) {
  const frames: Frame[] = [];
  const sockets: string[] = [];
  page.on("websocket", socket => {
    sockets.push(socket.url());
    socket.on("framereceived", event => { try { frames.push(JSON.parse(String(event.payload))); } catch { /* non-JSON ignored */ } });
  });
  return { frames, sockets };
}
async function lobby(page: Page) {
  const app = new SunbirdPage(page);
  await app.open(); await app.ready(); await app.openMenu("open-live", "Race Lobby");
  return app;
}

test("private invite: two pilots stay seated, ready together, share start/seed and exchange movement", async ({ browser, baseURL }, info) => {
  const a = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const b = await browser.newContext({ baseURL, viewport: { width: 568, height: 320 } });
  // Different calendar day, but the real epoch clock is unchanged. This
  // reproduces friends choosing different hills without granting paid flags.
  await b.addInitScript(() => {
    // Equipped paid advantages and consumables must not change a live start.
    localStorage.setItem("sunbird.save.v2", JSON.stringify({ activeSkin: "bluejay", ownedSkins: ["sunbird", "bluejay"], armedBoosts: ["headstart", "hotwings"], ownedUpgrades: ["doubletap"], gold: true, settings: { doubleTapBoost: true } }));
    const NativeDate = Date;
    window.Date = new Proxy(NativeDate, {
      construct(target, args) { return Reflect.construct(target, args.length ? args : [NativeDate.now() - 86400000]); },
    });
  });
  try {
    const host = await a.newPage(), guest = await b.newPage();
    const hw = wire(host), gw = wire(guest);
    const ha = await lobby(host), ga = await lobby(guest);
    expect(hw.sockets).toHaveLength(0); // browsing isn't an unready public seat
    await host.locator('[data-action="host-room"]').click();
    await expect(host.locator('[data-action="ready-room"]')).toBeEnabled();
    const code = (await host.locator(".room-now-code").textContent())!.trim();
    await guest.getByLabel("Room code", { exact: true }).fill(`${baseURL}/#room=${code}`);
    await guest.getByLabel("Room code", { exact: true }).press("Enter");
    for (const page of [host, guest]) await expect(page.locator(".room-presence")).toHaveText("2 connected · 0 ready");
    // Exceeds the old six-second movement timeout while both birds are idle.
    await expect.poll(() => hw.frames.filter(f => f.type === "state").length, { timeout: 1500 }).toBe(0);
    await host.waitForTimeout(7000);
    for (const page of [host, guest]) await expect(page.locator(".room-presence")).toHaveText("2 connected · 0 ready");
    await host.screenshot({ path: info.outputPath("private-room-phone.png") });
    await host.locator('[data-action="ready-room"]').click();
    await expect(host.locator('[data-action="ready-room"]')).toHaveText("Cancel ready");
    await expect(guest.locator(".room-presence")).toHaveText("2 connected · 1 ready");
    await expect(guest.locator(".room-bird.is-ready")).toHaveCount(1);
    await expect(guest.locator(".room-bird.is-ready small")).toHaveText("Ready ✓");
    await guest.locator('[data-action="ready-room"]').click();
    for (const page of [host, guest]) await expect(page.locator('[data-action="pause"]')).toBeVisible();
    await expect.poll(() => hw.frames.some(f => f.type === "start")).toBe(true);
    const start = hw.frames.find(f => f.type === "start")!;
    expect(gw.frames.find(f => f.type === "start")).toEqual(start);
    expect(hw.sockets).toHaveLength(1); expect(gw.sockets).toHaveLength(1);
    for (const page of [host, guest]) await expect(page.locator('[data-ref="distance"]')).toHaveText("0 m");
    const loadout = await guest.evaluate(() => JSON.parse(localStorage.getItem("sunbird.save.v2")!));
    expect(loadout.activeSkin).toBe("bluejay");
    expect(loadout.armedBoosts).toEqual(["headstart", "hotwings"]);
    await expect.poll(() => hw.frames.filter(f => f.type === "state" && (f.pilots?.length ?? 0) >= 2).length, { timeout: 20000 }).toBeGreaterThan(5);
    for (const page of [host, guest]) await expect(page.locator('[data-ref="distance"]')).not.toHaveText("0 m");
    for (const page of [host, guest]) {
      await expect(page.locator(".rm-count")).toHaveText("2 birds");
      await expect(page.locator(".roster-track .rb.remote")).toHaveCount(1);
    }
    await ga.expectNoOverlaps([".hud-header", ".flight-messages", ".flight-footer", ".alt-gauge"], ".hud-root");
    await guest.screenshot({ path: info.outputPath("live-race-landscape.png") });
    expect(ha.errors).toEqual([]); expect(ga.errors).toEqual([]);
  } finally { await a.close(); await b.close(); }
});

test("public matching starts both browsers from the same server signal", async ({ browser, baseURL }) => {
  const a = await browser.newContext({ baseURL }), b = await browser.newContext({ baseURL });
  try {
    const host = await a.newPage(), guest = await b.newPage();
    const hw = wire(host), gw = wire(guest);
    await lobby(host); await lobby(guest);
    await Promise.all([host.locator('[data-action="pvp-casual"]').click(), guest.locator('[data-action="pvp-casual"]').click()]);
    await expect.poll(() => hw.frames.some(f => f.type === "start")).toBe(true);
    await expect.poll(() => gw.frames.some(f => f.type === "start")).toBe(true);
    expect(hw.frames.find(f => f.type === "start")).toEqual(gw.frames.find(f => f.type === "start"));
    for (const page of [host, guest]) await expect(page.locator('[data-action="pause"]')).toBeVisible();
    expect(hw.sockets).toHaveLength(1); expect(gw.sockets).toHaveLength(1);
  } finally { await a.close(); await b.close(); }
});

test("leaving a private room removes the real seat and returns to choices", async ({ page }) => {
  const frames = wire(page);
  await lobby(page); await page.locator('[data-action="host-room"]').click();
  await expect(page.locator('[data-action="ready-room"]')).toBeEnabled();
  await page.locator('[data-action="room-close"]').click();
  await expect(page.locator('[data-action="host-room"]')).toBeVisible();
  await expect(page.locator('[data-action="ready-room"]')).toHaveCount(0);
  expect(frames.sockets).toHaveLength(1);
});


test("cancel leaves matchmaking; an empty search falls back to clearly labeled AI", async ({ page }) => {
  await lobby(page);
  await page.locator('[data-action="pvp-casual"]').click();
  await expect(page.locator(".matchmaking")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".matchmaking")).toBeHidden();
  await expect(page.locator('[data-action="pvp-casual"]')).toBeVisible();
  await page.locator('[data-action="pvp-casual"]').click();
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  await expect(page.locator(".rm-net")).toHaveText("practice");
  await expect(page.locator(".rm-count")).toHaveText("41 birds");
});


test("an interrupted live race returns to an honest lobby instead of silently rejoining", async ({ browser, baseURL }) => {
  const a = await browser.newContext({ baseURL }), b = await browser.newContext({ baseURL });
  try {
    const host = await a.newPage(), guest = await b.newPage();
    let connection: WebSocketRoute | undefined;
    let connections = 0;
    await host.routeWebSocket(/\/mp(?:\?|$)/, route => {
      connection = route; connections++; route.connectToServer();
    });
    await lobby(host); await lobby(guest);
    await host.locator('[data-action="host-room"]').click();
    await expect(host.locator('[data-action="ready-room"]')).toBeEnabled();
    const code = (await host.locator(".room-now-code").textContent())!.trim();
    await guest.getByLabel("Room code", { exact: true }).fill(code);
    await guest.getByLabel("Room code", { exact: true }).press("Enter");
    await expect(guest.locator(".room-presence")).toHaveText("2 connected · 0 ready");
    await host.locator('[data-action="ready-room"]').click();
    await guest.locator('[data-action="ready-room"]').click();
    await expect(host.locator('[data-action="pause"]')).toBeVisible();
    expect(connection).toBeDefined();
    await connection!.close({ code: 1012, reason: "Transport interruption test" });
    await expect(host.locator(".screen-head h2")).toHaveText("Race Lobby");
    await expect(host.locator(".network-notice")).toContainText("Race connection lost");
    await expect(host.locator('[data-action="pause"]')).toBeHidden();
    await expect(host.locator('[data-action="ready-room"]')).toBeDisabled();
    expect(connections).toBe(1);
    await host.locator('[data-action="room-close"]').click();
    await expect(host.locator('[data-action="host-room"]')).toBeEnabled();
  } finally { await a.close(); await b.close(); }
});
