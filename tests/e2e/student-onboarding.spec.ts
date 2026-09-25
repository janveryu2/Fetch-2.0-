import { expect, test } from "@playwright/test";

test.describe("Student Onboarding & Study Preferences E2E", () => {
  test("unauthenticated visits to /app/start redirect to /app/home", async ({ page }) => {
    await page.goto("/app/start");
    await page.waitForURL(/\/app\/home/);
    expect(page.url()).toContain("/app/home");
  });

  test("unauthenticated visits to /app/onboarding redirect safely", async ({ page }) => {
    await page.goto("/app/onboarding");
    await page.waitForURL(/\/app/);
    expect(page.url()).toMatch(/\/app/);
  });

  test("settings page renders study preferences card and saves in demo mode", async ({ page }) => {
    await page.goto("/app/settings");

    // Check heading for Study Preferences card
    await expect(page.getByRole("heading", { name: /study preferences/i })).toBeVisible();

    // Check primary subject input
    const subjectInput = page.getByLabel(/primary subject/i);
    await expect(subjectInput).toBeVisible();

    // Check study goal select
    const goalSelect = page.getByLabel(/study goal/i);
    await expect(goalSelect).toBeVisible();

    // Check default focus length select
    const focusSelect = page.getByLabel(/default pomodoro focus duration/i);
    await expect(focusSelect).toBeVisible();

    // Check save button
    const saveBtn = page.getByRole("button", { name: /save study preferences/i });
    await expect(saveBtn).toBeVisible();

    // Update subject and save
    await subjectInput.fill("Computer Science");
    await saveBtn.click();
    await expect(page.getByText("Study preferences saved", { exact: true })).toBeVisible();
  });
});
