import { test } from "@playwright/test";
import { SunbirdPage } from "./SunbirdPage";

test("probe fever geometry", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const app = new SunbirdPage(page);
  await app.open();
  await app.ready();
  await app.fly();
  await app.layoutFixture(true);
  const info = await page.locator("#layout-fixture").evaluate((root) => {
    const out: Record<string, unknown> = {};
    const f = root.querySelector<HTMLElement>(".fever-wrap")!;
    const r = f.getBoundingClientRect();
    const cs = getComputedStyle(f);
    out.fever = {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom },
      position: cs.position,
      top: cs.top,
      right: cs.right,
      display: cs.display,
      opacity: cs.opacity,
      offsetParent: (f.offsetParent as HTMLElement | null)?.className ?? null,
      parent: f.parentElement?.className ?? null,
      inHeader: !!f.closest(".hud-header"),
    };
    const ph = root.querySelector<HTMLElement>(".play-hud")!;
    const pr = ph.getBoundingClientRect();
    out.playHud = { y: pr.y, h: pr.height, bottom: pr.bottom, position: getComputedStyle(ph).position };
    out.viewport = { w: window.innerWidth, h: window.innerHeight };
    return out;
  });
  console.log("PROBE " + JSON.stringify(info, null, 2));
});
