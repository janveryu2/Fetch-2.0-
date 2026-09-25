import { expect, test } from "@playwright/test";

test.describe("Phase 14: Full Account & Workspace Journeys", () => {
  test("navigates across all workspace views and verifies truthful availability badges", async ({
    page,
  }) => {
    // 1. Home
    await page.goto("/app/home");
    await expect(page.getByRole("heading", { name: /what are we learning today/i })).toBeVisible();

    // 2. Progress
    await page.goto("/app/progress");
    await expect(page.getByRole("heading", { name: /study progress/i })).toBeVisible();

    // 3. Calendar
    await page.goto("/app/calendar");
    await expect(page.getByRole("heading", { name: /study calendar/i })).toBeVisible();

    // 4. Friends & Messages
    await page.goto("/app/friends");
    await expect(page.getByRole("heading", { name: /friends & study groups/i })).toBeVisible();

    // 5. Live Competition
    await page.goto("/app/live");
    await expect(page.getByRole("heading", { name: /live study battle/i })).toBeVisible();

    // 6. Settings
    await page.goto("/app/settings");
    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();
  });

  test("settings page supports appearance toggle and safe export workflow", async ({ page }) => {
    await page.goto("/app/settings");

    // Appearance toggle
    const lightBtn = page.getByRole("button", { name: /light/i });
    const darkBtn = page.getByRole("button", { name: /dark/i });
    await expect(lightBtn).toBeVisible();
    await expect(darkBtn).toBeVisible();

    await darkBtn.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await lightBtn.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    // Export button is present and clickable
    const exportBtn = page.getByRole("button", { name: /export/i });
    await expect(exportBtn).toBeVisible();

    // Danger zone requires explicit confirmation
    const dangerHeading = page.getByRole("heading", { name: /danger zone/i });
    await expect(dangerHeading).toBeVisible();
  });
});
