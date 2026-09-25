import { expect, test } from "@playwright/test";

test.describe("Phase 4: Navigation and Secondary Tools", () => {
  test("sidebar study shortcut resolves direct destinations and updates to resume draft", async ({
    page,
    isMobile,
  }) => {
    // Only run sidebar check on desktop viewport where aside is rendered
    if (isMobile) return;

    await page.goto("/app/home");

    // 1. Without packs, shortcut links to #add-material
    const sidebarShortcut = page.locator("aside").getByRole("link", { name: "Start studying" });
    await expect(sidebarShortcut).toBeVisible();
    await expect(sidebarShortcut).toHaveAttribute("href", "/app/home#add-material");

    // 2. Create a study pack
    await page.getByLabel("StudyPack name").fill("Physics Kinematics");
    await page
      .getByLabel(/Paste your study material/)
      .fill(
        "Velocity is the rate of change of position with respect to time. Acceleration is the rate of change of velocity. Displacement measures the shortest distance between two points.",
      );
    await page.getByRole("button", { name: /Generate/ }).click();
    await expect(page).toHaveURL(/study-packs\//);

    // 3. Now shortcut points directly to /app/study/[packId]
    await expect(sidebarShortcut).toHaveAttribute("href", /\/app\/study\//);

    // 4. Start studying and answer first question to create a draft
    await sidebarShortcut.click();
    await expect(page).toHaveURL(/\/app\/study\//);

    const firstRadio = page.getByRole("radio").first();
    if ((await firstRadio.count()) > 0) {
      await firstRadio.check();
    } else {
      await page.getByLabel("Your answer", { exact: true }).fill("velocity");
    }
    await page.getByRole("button", { name: "Check answer" }).click();

    // 5. Navigate to another page (e.g. Home) and check the shortcut label
    await page.goto("/app/home");
    const resumeShortcut = page.locator("aside").getByRole("link", { name: "Resume studying" });
    await expect(resumeShortcut).toBeVisible();
    await expect(resumeShortcut).toHaveAttribute("href", /\/app\/study\//);
  });

  test("StudyPacks list state reflects in URL query/sort and restores on Back", async ({
    page,
  }) => {
    // Create two packs first
    await page.goto("/app/home");
    await page.getByLabel("StudyPack name").fill("Astronomy Stars");
    await page
      .getByLabel(/Paste your study material/)
      .fill(
        "Stars are massive celestial bodies made of hydrogen and helium. Nuclear fusion occurs in stellar cores, producing light and heat.",
      );
    await page.getByRole("button", { name: /Generate/ }).click();
    await expect(page).toHaveURL(/study-packs\//);

    // Navigate to StudyPacks page with deep link params
    await page.goto("/app/study-packs?q=Astronomy&sort=studied");

    // Verify search input and sort select reflect URL parameters
    const searchInput = page.getByPlaceholder("Search your StudyPacks");
    await expect(searchInput).toHaveValue("Astronomy");

    const sortSelect = page.getByRole("combobox");
    await expect(sortSelect).toHaveValue("studied");

    // Only Astronomy pack should match
    await expect(page.getByRole("heading", { name: "Astronomy Stars" })).toBeVisible();

    // Open pack
    await page.getByRole("link", { name: "Open pack" }).click();
    await expect(page).toHaveURL(/study-packs\//);

    // Click browser Back button
    await page.goBack();
    await expect(page).toHaveURL(/study-packs\?q=Astronomy&sort=studied/);
    await expect(searchInput).toHaveValue("Astronomy");
    await expect(sortSelect).toHaveValue("studied");
  });

  test("signup wizard has streamlined 4 steps and accessible flow", async ({
    page,
  }) => {
    await page.goto("/app/signup");

    // Step 1: Email
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What’s your email address?" })).toBeVisible();
    await page.getByLabel("Email").fill("student@example.com");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2: Name and Username
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
    await page.getByLabel("Full name").fill("Jane Learner");
    await page.getByLabel("Username").fill("jane_learner");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: Password
    await expect(page.getByText("Step 3 of 4")).toBeVisible();
    await page.getByLabel("Password", { exact: true }).fill("strongpassword123");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 4: Review
    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    await expect(page.getByText("student@example.com · @jane_learner")).toBeVisible();

    // Verify button to enter development demo
    const enterDemoBtn = page.getByRole("button", { name: "Enter development demo" });
    await expect(enterDemoBtn).toBeVisible();
    await enterDemoBtn.click();
    await expect(page).toHaveURL(/\/app\/home/);
  });
});
