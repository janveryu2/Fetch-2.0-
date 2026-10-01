import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Browser-only verification data. Production and account data are never seeded.
const fixture = {
  packs: [
    { id: "mobile-quiz", title: "Responsive verification quiz with a long study title", sourceLabel: "Verification notes", createdAt: "2026-10-01T00:00:00Z", progress: 0, questions: [{ id: "q1", type: "fill_blank", prompt: "Verification prompt", answer: "Verification answer", explanation: "Test only" }] },
    { id: "mobile-deck", title: "Verification flashcard and summary pack", sourceLabel: "Verification notes", createdAt: "2026-09-30T00:00:00Z", progress: 0, questions: [], artifacts: [
      { id: "mobile-cards", packId: "mobile-deck", kind: "flashcards", origin: "manual", status: "ready", title: "Verification deck", version: 1, createdAt: "2026-09-30T00:00:00Z", updatedAt: "2026-09-30T00:00:00Z" },
      { id: "mobile-summary", packId: "mobile-deck", kind: "summary", origin: "generated", status: "ready", title: "Verification summary", version: 1, createdAt: "2026-09-30T00:00:00Z", updatedAt: "2026-09-30T00:00:00Z" },
    ] },
  ], attempts: [], events: [],
};
const screens = ["home", "study-packs", "flashcards", "calendar", "tutor", "pomodoro", "music", "live", "friends"];
async function setup(page: Page) {
  await page.addInitScript(data => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (!localStorage.getItem("fetch-development-fixture-v1")) localStorage.setItem("fetch-development-fixture-v1", JSON.stringify({ ...data, events: [{ id: "mobile-event", title: "Verification review", date, type: "study", allDay: false, start: "10:00", end: "11:00", color: "#1065e6" }] }));
  }, fixture);
  await page.route("**/api/artifacts/mobile-cards/cards", route => route.fulfill({ json: { cards: [{ id: "mobile-card", front: "How does the mobile card preserve typed recall?", back: "By checking the answer before mastery", aliases: [], position: 0 }] } }));
  await page.route("**/api/flashcards/session", route => route.fulfill({ json: { sessionId: "mobile-session" } }));
  await page.route("**/api/flashcards/attempt", route => route.fulfill({ json: { ok: true } }));
}

test("nine screens fit phones, tablets, both iPad orientations and desktop in both themes", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  test.setTimeout(600_000);
  await setup(page);
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(value => localStorage.setItem("fetch-theme", value), theme);
    for (const [width, height] of [[360, 800], [390, 844], [430, 932], [768, 1024], [834, 1194], [1024, 768], [1194, 834], [1440, 960]]) {
      await page.setViewportSize({ width, height });
      for (const screen of screens) {
        await page.goto(screen === "flashcards" ? "/app/study-flashcards/mobile-cards?packId=mobile-deck&title=Verification" : `/app/${screen}`);
        await expect(page.locator("h1").first()).toBeAttached();
        if (screen === "flashcards") await expect(page.getByRole("button", { name: "Card front, click to flip" })).toBeVisible();
        if (screen === "study-packs") await expect(page.locator(".study-pack-card")).toHaveCount(2);
        if (screen === "calendar") {
          await page.getByRole("button", { name: "Month", exact: true }).click();
          await expect(page.getByRole("button", { name: "Verification review", exact: true })).toBeVisible();
        }
        await page.evaluate(() => document.fonts.ready);
        const overflow = await page.evaluate(() => ({ width: innerWidth, actual: document.documentElement.scrollWidth }));
        expect(overflow.actual, `${screen}/${theme}/${width}: horizontal overflow`).toBeLessThanOrEqual(width + 1);
        const mobile = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
        if (width < 1280) {
          await expect(mobile).toBeVisible();
          for (const link of await mobile.locator("a,button").all()) {
            const box = await link.boundingBox();
            expect(box!.height).toBeGreaterThanOrEqual(44);
            expect(box!.width).toBeGreaterThanOrEqual(44);
          }
        } else {
          await expect(mobile).toBeHidden();
          await expect(page.locator(".fetch-sidebar")).toBeVisible();
        }
        if (width === 390 || width === 834 || (width === 1440 && theme === "light")) {
          await page.screenshot({ path: `test-results/mobile-review/${screen}-${theme}-${width}.png`, fullPage: true });
        }
        if (width === 390) {
          const result = await new AxeBuilder({ page }).include("#app-main").withTags(["wcag2a", "wcag2aa"]).analyze();
          expect(result.violations.filter(v => v.impact === "critical" || v.impact === "serious"), `${screen}/${theme} accessibility`).toEqual([]);
        }
      }
    }
  }
});

test("compact navigation, More sheet, dashboard editor and material filters work", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/home");
  await expect(page.locator("#home-material-form")).toBeHidden();
  await page.getByRole("link", { name: "Create a StudyPack", exact: true }).click();
  await expect(page.locator("#home-material-form")).toBeVisible();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("button", { name: "More", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Your workspace" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("link", { name: "FETCH AI Tutor" }).click();
  await expect(page).toHaveURL(/app\/tutor/);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Tutor" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Show StudyPack context & past conversations" })).toBeVisible();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("button", { name: "More" }).click();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("button", { name: "More" })).toBeFocused();
  await page.goto("/app/study-packs");
  await page.getByRole("button", { name: "Flashcards", exact: true }).click();
  await expect(page.locator(".study-pack-card")).toHaveCount(1);
  await expect(page.locator(".study-pack-card")).toContainText("Verification flashcard");
  await expect(page.getByRole("link", { name: "Study Quiz" })).toHaveCount(0);
  await page.getByRole("button", { name: "Quizzes", exact: true }).click();
  await expect(page.locator(".study-pack-card")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Study Quiz" })).toBeVisible();
  await page.getByRole("textbox", { name: "Search StudyPacks" }).fill("No matching title");
  await expect(page.getByRole("heading", { name: "No matching StudyPacks" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.locator(".study-pack-card")).toHaveCount(2);
});

test("mobile room switch and timer settings keep controls accessible", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/app/live");
  await expect(page.locator(".live-create-panel")).toBeVisible();
  await expect(page.locator(".live-join-panel")).toBeHidden();
  await page.getByRole("button", { name: "Join a room", exact: true }).click();
  await page.getByLabel("Room code").fill("abc123");
  await expect(page.getByLabel("Room code")).toHaveValue("ABC123");
  await expect(page.getByRole("button", { name: "Join Room", exact: true })).toBeDisabled();
  await page.goto("/app/pomodoro");
  await expect(page.locator("#pomodoro-settings-panel")).toBeHidden();
  await page.getByRole("button", { name: "Timer settings", exact: true }).click();
  await expect(page.locator("#pomodoro-settings-panel")).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Pomodoro", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
});

test("software keyboard viewport does not leave navigation over the tutor input", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/tutor");
  await page.getByLabel("Your question").focus();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", { configurable: true, value: 420 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator("html")).toHaveAttribute("data-keyboard-open", "true");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeHidden();
  await expect(page.getByLabel("Your question")).toBeFocused();
  await page.evaluate(() => {
    delete (window.visualViewport as unknown as { height?: number }).height;
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
});
