import { test, expect } from "@playwright/test";
import type { Server } from "node:http";
import { SUPPORTED_LOCALES, type SupportedLocale } from "../src/i18n";
import {
  FREEZE, boot, goHome, openScreen,
  startArtifactServer, stopArtifactServer, visualDefects,
} from "./visual-helpers";

/**
 * Per-language visual invariants.
 *
 * A DOM spec can confirm `#language-select` has 20 options; it cannot see that
 * the Thai menu overflows its button or that Arabic lost its direction. Each
 * test here covers one phase of Poki's localization rollout, switching language
 * in-page (the same path a player uses) instead of rebooting per locale.
 */
const PHASES: { label: string; codes: SupportedLocale[] }[] = [
  { label: "phase 1 — EFIGS + Turkish", codes: ["en", "es", "de", "fr", "it", "tr"] },
  { label: "phase 2 — CJK", codes: ["zh-CN", "ja", "ko"] },
  { label: "phase 3 — pt-BR, Russian, Arabic", codes: ["pt-BR", "ru", "ar"] },
  { label: "phase 4 — long tail", codes: ["nl", "pl", "sv", "hi", "id", "vi", "th", "mt"] },
];

test("every shipped locale is selectable", () => {
  const covered = PHASES.flatMap((p) => p.codes).sort();
  expect(covered).toEqual([...SUPPORTED_LOCALES.map((l) => l.code)].sort());
});

let server: Server;
let baseUrl = "";

test.beforeAll(async () => { ({ server, baseUrl } = await startArtifactServer()); });
test.afterAll(async () => { await stopArtifactServer(server); });

for (const phase of PHASES) {
  test(`${phase.label} fit their screens and keep their direction`, async ({ page }) => {
    await boot(page, baseUrl);
    await page.addStyleTag({ content: FREEZE });

    const problems: string[] = [];
    for (const code of phase.codes) {
      const meta = SUPPORTED_LOCALES.find((l) => l.code === code)!;

      // The selector lives on the Settings screen, so that is where a player
      // changes language — switch it there, then check both screens.
      await openScreen(page, "open-settings");
      await page.selectOption("#language-select", code);

      // The switch must actually land: lang attribute, direction, selector.
      expect(await page.evaluate(() => document.documentElement.lang), `${code} lang`).toBe(code);
      expect(await page.evaluate(() => document.documentElement.dir), `${code} dir`).toBe(meta.rtl ? "rtl" : "ltr");
      await expect(page.locator("#language-select")).toHaveValue(code);
      await expect(page.locator("#language-select option")).toHaveCount(SUPPORTED_LOCALES.length);

      const settings = await visualDefects(page);
      if (settings.length) problems.push(`${code} settings: ${settings.join(" | ")}`);

      await goHome(page);
      expect(await page.evaluate(() => document.documentElement.lang), `${code} lang after back`).toBe(code);
      const menu = await visualDefects(page);
      if (menu.length) problems.push(`${code} menu: ${menu.join(" | ")}`);
    }

    expect(problems, "locales with visual defects").toEqual([]);
  });
}
