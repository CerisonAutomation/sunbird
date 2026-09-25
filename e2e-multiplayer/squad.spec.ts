import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { SunbirdPage } from "../e2e/SunbirdPage";

test("Squad uses real registration, friend codes, clubs, chat and leaving", async ({ browser, baseURL }) => {
  const a = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const b = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const host = await a.newPage(), guest = await b.newPage();
    const ha = new SunbirdPage(host), ga = new SunbirdPage(guest);
    for (const app of [ha, ga]) { await app.open(); await app.ready(); await app.openMenu("open-squad", "Squad"); }
    const hc = host.locator('[data-ref="menuCard"]'), gc = guest.locator('[data-ref="menuCard"]');
    for (const card of [hc, gc]) await expect(card.locator(".screen-head .pill")).toHaveText(/^SUN-/);
    const code = (await gc.locator(".screen-head .pill").textContent())!;
    await hc.getByLabel("Friend code", { exact: true }).fill(code);
    await hc.getByLabel("Friend code", { exact: true }).press("Enter");
    await expect(hc.locator(".fr-code")).toHaveText(code);
    const name = `Flock ${Date.now().toString(36)}`;
    await hc.getByLabel("Club name", { exact: true }).fill(name);
    await hc.getByLabel("Club name", { exact: true }).press("Enter");
    await expect(hc.getByLabel("Club message", { exact: true })).toBeVisible();
    await gc.getByRole("button", { name: "Refresh Squad", exact: true }).click();
    await gc.locator(".club-row").filter({ hasText: name }).getByRole("button", { name: "Join", exact: true }).click();
    await expect(gc.getByLabel("Club message", { exact: true })).toBeVisible();
    await gc.getByLabel("Club message", { exact: true }).fill("Unsent draft");
    await hc.getByLabel("Club message", { exact: true }).fill("Ready for another flight?");
    await hc.getByLabel("Club message", { exact: true }).press("Enter");
    await expect(hc.getByLabel("Club message", { exact: true })).toHaveValue("");
    await expect(gc.locator('[data-ref="chatBox"]')).toContainText("Ready for another flight?");
    await expect(gc.getByLabel("Club message", { exact: true })).toHaveValue("Unsent draft");
    // Exercise a real scrollable history, not just a single chat bubble.
    const auth = await host.evaluate(() => {
      const id = JSON.parse(localStorage.getItem("sunbird.save.v2")!).deviceId;
      return { id, token: localStorage.getItem(`sunbird.squad.key.${id}`)! };
    });
    for (let i = 0; i < 12; i++) {
      const sent = await host.request.post("/social/chat", { headers: { authorization: `Bearer ${auth.token}` }, data: { deviceId: auth.id, text: `History message ${i}` } });
      expect(sent.ok()).toBe(true);
    }
    await gc.getByRole("button", { name: "Refresh Squad", exact: true }).click();
    await expect(gc.locator('[data-ref="chatBox"]')).toContainText("History message 11");
    await expect(gc.getByLabel("Club message", { exact: true })).toHaveValue("Unsent draft");
    const chat = gc.locator('[data-ref="chatBox"]');
    await expect.poll(() => chat.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2);
    await chat.evaluate(el => { el.scrollTop = 10; });
    await host.request.post("/social/chat", { headers: { authorization: `Bearer ${auth.token}` }, data: { deviceId: auth.id, text: "New message while you read" } });
    await expect(chat).toContainText("New message while you read");
    expect(await chat.evaluate(el => el.scrollTop)).toBeCloseTo(10, 0);
    await gc.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(gc.locator('[data-ref="chatBox"]')).toHaveCount(0);
    await ga.expectMenuFits(); await ha.expectMenuFits();
    expect(ha.errors).toEqual([]); expect(ga.errors).toEqual([]);
  } finally { await a.close(); await b.close(); }
});

test("Squad authorization rejects impersonation and nonmember chat; unknown clubs cannot be joined", async ({ request }) => {
  const id = randomBytes(12).toString("hex"), other = randomBytes(12).toString("hex");
  const headers = { authorization: `Bearer ${randomBytes(32).toString("hex")}` };
  const otherHeaders = { authorization: `Bearer ${randomBytes(32).toString("hex")}` };
  expect((await request.post("/social/register", { data: { deviceId: id, name: "Owner" } })).status()).toBe(401);
  expect((await request.post("/social/register", { headers, data: { deviceId: id, name: "Owner" } })).ok()).toBe(true);
  expect((await request.post("/social/register", { headers: otherHeaders, data: { deviceId: id, name: "Imposter" } })).status()).toBe(403);
  expect((await request.post("/social/register", { headers: otherHeaders, data: { deviceId: other, name: "Guest" } })).ok()).toBe(true);
  const create = await request.post("/social/clubs/create", { headers, data: { deviceId: id, name: "API flight" } });
  expect(create.ok()).toBe(true);
  const { club } = await create.json();
  expect((await request.get(`/social/chat?device=${other}&club=${club.id}`, { headers: otherHeaders })).status()).toBe(403);
  expect((await request.get(`/social/profile?device=${id}`, { headers: otherHeaders })).status()).toBe(403);
  expect((await request.post("/social/clubs/join", { headers: otherHeaders, data: { deviceId: other, clubId: 999999999 } })).status()).toBe(404);
  const profile = await request.get(`/social/profile?device=${other}`, { headers: otherHeaders });
  expect((await profile.json()).clubId).toBeNull();
  expect((await request.post("/social/clubs/join", { headers: otherHeaders, data: { deviceId: other, clubId: club.id } })).ok()).toBe(true);
  expect((await request.get(`/social/chat?device=${other}&club=${club.id}`, { headers: otherHeaders })).ok()).toBe(true);
});


test("a lost Squad key has explicit safe re-enrollment without resetting flight progress", async ({ page }) => {
  const app = new SunbirdPage(page);
  await app.open(); await app.ready(); await app.openMenu("open-squad", "Squad");
  const card = page.locator('[data-ref="menuCard"]');
  await expect(card.locator(".screen-head .pill")).toHaveText(/^SUN-/);
  const oldCode = await card.locator(".screen-head .pill").textContent();
  const before = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem("sunbird.save.v2")!);
    localStorage.removeItem(`sunbird.squad.key.${save.deviceId}`);
    return { deviceId: save.deviceId, wallet: save.wallet, ownedSkins: save.ownedSkins };
  });
  await page.reload(); await app.ready(); await app.openMenu("open-squad", "Squad");
  await expect(card.getByRole("region", { name: "Squad profile recovery" })).toBeVisible();
  await card.getByRole("button", { name: "Create a new Squad profile", exact: true }).click();
  await expect(card.getByRole("region", { name: "Squad profile recovery" })).toBeVisible();
  await card.getByRole("checkbox", { name: "I understand this creates a separate Squad profile." }).check();
  await card.getByRole("button", { name: "Create a new Squad profile", exact: true }).click();
  await expect(card.locator(".screen-head .pill")).toHaveText(/^SUN-/);
  expect(await card.locator(".screen-head .pill").textContent()).not.toBe(oldCode);
  const after = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem("sunbird.save.v2")!);
    return { deviceId: save.deviceId, wallet: save.wallet, ownedSkins: save.ownedSkins };
  });
  expect(after).toEqual(before);
  await expect(card.getByRole("region", { name: "Squad profile recovery" })).toHaveCount(0);
  // The expected failed authorization request is deliberately exercised above.
  expect(app.errors.filter(error => !error.includes("403"))).toEqual([]);
});
