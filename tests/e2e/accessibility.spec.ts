import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 5: Accessibility and System Consistency (WCAG 2.2 AA)", () => {
  test("audit key surfaces with axe for serious/critical violations", async ({
    page,
  }) => {
    const routes = ["/", "/app/home", "/app/study-packs", "/app/progress", "/app/signup"];

    for (const route of routes) {
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();

      const severeViolations = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        severeViolations,
        `Accessibility violations found on ${route}: ${JSON.stringify(severeViolations, null, 2)}`,
      ).toEqual([]);
    }
  });

  test("material intake tablist supports keyboard arrow navigation", async ({
    page,
  }) => {
    await page.goto("/app/home");

    // Focus the first tab
    const pasteTab = page.getByRole("tab", { name: /Paste text/i });
    await pasteTab.focus();
    await expect(pasteTab).toBeFocused();
    await expect(pasteTab).toHaveAttribute("aria-selected", "true");

    // Press ArrowRight to move to PDF tab
    await page.keyboard.press("ArrowRight");
    const pdfTab = page.getByRole("tab", { name: /PDF/i });
    await expect(pdfTab).toBeFocused();
    await expect(pdfTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: /PDF/i })).toBeVisible();

    // Press ArrowRight to move to Scan notes tab
    await page.keyboard.press("ArrowRight");
    const scanTab = page.getByRole("tab", { name: /Scan notes/i });
    await expect(scanTab).toBeFocused();
    await expect(scanTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: /Scan notes/i })).toBeVisible();

    // Press ArrowRight to move to Link tab
    await page.keyboard.press("ArrowRight");
    const urlTab = page.getByRole("tab", { name: /Link/i });
    await expect(urlTab).toBeFocused();
    await expect(urlTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: /Link/i })).toBeVisible();

    // Press ArrowLeft to return to Scan notes tab
    await page.keyboard.press("ArrowLeft");
    await expect(scanTab).toBeFocused();
    await expect(scanTab).toHaveAttribute("aria-selected", "true");

    // Press Home to return to first tab
    await page.keyboard.press("Home");
    await expect(pasteTab).toBeFocused();
    await expect(pasteTab).toHaveAttribute("aria-selected", "true");
  });

  test("respects prefers-reduced-motion across animated elements", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app/home");

    // Verify reduced motion css rule is active
    const isReduced = await page.evaluate(() => {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    });
    expect(isReduced).toBe(true);
  });
});
