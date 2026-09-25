import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("landing and authentication entry render cleanly", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /turn any module/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /fetch.*study buddy/i })).toBeVisible();
  await page.getByRole("link", { name: /launch app/i }).click();
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  expect(errors.filter((error) => !error.includes("/_next/hmr"))).toEqual([]);
});

test("development learning workflow creates and opens a pack", async ({ page }) => {
  await page.goto("/app/home");
  await page.getByRole("tab", { name: /paste text/i }).click();
  await page.getByLabel(/studypack name/i).fill("Biology essentials");
  await page.getByLabel(/study material/i).fill("Photosynthesis converts light energy into chemical energy in plants. Chlorophyll absorbs light most strongly in the blue and red portions of the visible spectrum. Carbon dioxide and water help plants produce glucose and oxygen. These reactions support growth and store energy for later use.");
  await page.getByRole("button", { name: /generate/i }).click();
  await expect(page).toHaveURL(/study-packs\//);
  await expect(page.getByRole("heading", { name: "Biology essentials" })).toBeVisible();
  await page.locator("#app-main").getByRole("link", { name: "Study", exact: true }).click();
  await expect(page.getByText(/question 1/i)).toBeVisible();
});

test("workspace has no serious automated accessibility violations", async ({ page }) => {
  await page.goto("/app/home");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
});
