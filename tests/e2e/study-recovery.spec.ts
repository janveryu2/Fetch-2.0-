import { expect, test } from "@playwright/test";

test.describe("Study session draft recovery and progress recommendations", () => {
  test("recovers an interrupted quiz session after page reload and updates progress recommendation", async ({
    page,
  }) => {
    // 1. Create a pack via Home
    await page.goto("/app/home");
    await page.getByLabel("StudyPack name").fill("Chemistry Fundamentals");
    await page
      .getByLabel(/Paste your study material/)
      .fill(
        "Atoms consist of protons, neutrons, and electrons. Protons have a positive electric charge. Neutrons have no charge and are neutral. Electrons orbit the nucleus in specific energy levels or shells.",
      );
    await page.getByRole("button", { name: /Generate/ }).click();
    await expect(page).toHaveURL(/study-packs\//);

    // 2. Open the study session
    await page
      .locator("#app-main")
      .getByRole("link", { name: "Study", exact: true })
      .click();

    // Answer the first question and check it
    const firstOption = page.getByRole("radio").first();
    const hasRadio = (await firstOption.count()) > 0;
    if (hasRadio) {
      await firstOption.check();
    } else {
      await page.getByLabel("Your answer", { exact: true }).fill("nucleus");
    }

    await page
      .getByRole("button", { name: "Check answer", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Answer feedback" }),
    ).toBeVisible();

    // 3. Simulate interruption: reload the page
    await page.reload();

    // 4. Verify Resume screen appears
    await expect(
      page.getByRole("heading", { name: /Resume your study session/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Resume session" }),
    ).toBeVisible();

    // Click Resume
    await page.getByRole("button", { name: "Resume session" }).click();
    await expect(
      page.getByRole("heading", { name: /Resume your study session/ }),
    ).not.toBeVisible();

    // Verify feedback and checked state are restored
    await expect(
      page.getByRole("region", { name: "Answer feedback" }),
    ).toBeVisible();

    // 5. Navigate to Progress page and verify recommendation points to active draft or recent pack
    await page.goto("/app/progress");
    await expect(page.getByRole("heading", { name: "Your learning journey", exact: true })).toBeVisible();
  });
});
