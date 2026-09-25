import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
const routes = [
  "home",
  "progress",
  "study-packs",
  "calendar",
  "live",
  "friends",
  "messages",
  "settings",
  "tutor",
  "pomodoro",
  "music",
];
test("all workspace surfaces remain accessible in both themes and four widths", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const widths = info.project.name === "desktop" ? [1440, 1024, 768] : [390];
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (t) => localStorage.setItem("fetch-theme", t),
      theme,
    );
    for (const width of widths) {
      await page.setViewportSize({ width, height: 960 });
      for (const route of routes) {
        await page.goto(`/app/${route}`);
        await expect(page.locator("h1")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        expect
          .soft(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            `${route} ${theme} ${width} overflow`,
          )
          .toBe(true);
        if (width === 1440 || width === 390) {
          const result = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          expect
            .soft(
              result.violations.filter(
                (v) => v.impact === "serious" || v.impact === "critical",
              ),
              `${route} ${theme} ${width}`,
            )
            .toEqual([]);
          await page.screenshot({
            path: path.join(
              "test-results",
              "visual",
              `${route}-${theme}-${width}.png`,
            ),
            fullPage: true,
          });
        }
      }
    }
  }
});
test("calendar creates, edits, persists, navigates, and deletes events", async ({
  page,
}) => {
  await page.goto("/app/calendar");
  await page.getByRole("button", { name: "New event", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Biology exam");
  await page.getByLabel("Start", { exact: true }).fill("08:30");
  await page.getByLabel("End", { exact: true }).fill("09:30");
  await page.getByLabel("Subject / course").fill("Biology");
  await page.getByLabel("Location", { exact: true }).fill("Room 204");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Biology exam/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Biology exam/ }).click();
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Room 204",
  );
  await page.getByLabel("Title", { exact: true }).fill("Biology review");
  await page.getByLabel("All day", { exact: true }).check();
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Biology review", exact: true }),
  ).toBeVisible();
  for (const view of ["Month", "Day", "Agenda", "Week"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(
      page.getByRole("region", { name: `${view} calendar` }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Next period" }).click();
  await expect(
    page.getByRole("button", { name: "Biology review", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page
    .getByRole("button", { name: "Biology review", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete event", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Biology review", exact: true }),
  ).toHaveCount(0);
});
test("Pomodoro start pause resume reset and delayed completion", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/app/pomodoro");
  await page.getByLabel("Focus (minutes)").fill("1");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.clock.fastForward(10000);
  await expect(page.getByRole("timer")).toHaveText("00:50");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.clock.fastForward(10000);
  await expect(page.getByRole("timer")).toHaveText("00:50");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.clock.fastForward(51000);
  await expect(
    page.getByText("Well done. Take a moment for yourself."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("timer")).toHaveText("01:00");
  await page.getByRole("button", { name: "Short break", exact: true }).click();
  await expect(page.getByRole("timer")).toHaveText("05:00");
});
test("local audio plays, pauses, seeks and remains mounted across navigation", async ({
  page,
}) => {
  await page.goto("/app/music");
  // A generated silent PCM WAV is test data, not a shipped recording.
  const samples = 8000 * 8;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  await page.getByLabel("Choose audio files").setInputFiles([
    { name: "Focus.wav", mimeType: "audio/wav", buffer: wav },
    { name: "Break.wav", mimeType: "audio/wav", buffer: wav },
  ]);
  const audio = page.locator("audio");
  await expect(audio).toBeVisible();
  await audio.evaluate(async (a: HTMLAudioElement) => {
    await a.play();
  });
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused))
    .toBe(false);
  await audio.evaluate((a: HTMLAudioElement) => {
    a.pause();
    a.currentTime = 2;
    a.volume = 0.4;
  });
  expect(await audio.evaluate((a: HTMLAudioElement) => a.volume)).toBe(0.4);
  expect(
    await audio.evaluate((a: HTMLAudioElement) => a.currentTime),
  ).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Next track" }).click();
  await expect(page.getByRole("region", { name: "Now playing" })).toContainText(
    "Break.wav",
  );
  await page.getByRole("button", { name: "Previous track" }).click();
  const src = await audio.getAttribute("src");
  await page
    .getByRole("link", { name: "Pomodoro Timer", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(audio).toHaveAttribute("src", src!);
  await page.getByRole("button", { name: "Clear local playlist" }).click();
  await expect(audio).toHaveCount(0);
});
test("pricing, tutor drafts, local rooms, and honest friend actions", async ({
  page,
}) => {
  await page.goto("/#pricing");
  await expect(page.locator("#pricing article")).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "FETCH Pro Max" }),
  ).toBeVisible();
  await expect(page.locator("#pricing")).toContainText("₱49");
  await page
    .locator("#pricing")
    .getByRole("link", { name: "Get started free" })
    .click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/tutor");
  await page.getByRole("button", { name: "Explain a concept" }).click();
  await expect(page.getByLabel("Your question")).toHaveValue(
    "Help me understand this concept: ",
  );
  await expect(
    page.getByRole("button", { name: "Send to FETCH" }),
  ).toBeDisabled();
  await page.goto("/app/live");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  const code = await page.locator(".select-all").innerText();
  await page.getByLabel("Room code", { exact: true }).fill("ZZZZZZ");
  await page.getByRole("button", { name: "Check room code" }).click();
  await expect(page.getByRole("status")).toContainText("Code not found");
  await page.getByLabel("Room code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Check room code" }).click();
  await expect(page.getByRole("status")).toContainText(
    "No multiplayer connection",
  );
  await page.goto("/app/friends");
  await page.getByLabel("Search by username").fill("student");
  await page.getByRole("button", { name: "Search friends" }).click();
  await expect(page.getByRole("status")).toContainText(
    "No search or friend request",
  );
});
test("mobile More exposes every destination and theme persists", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.goto("/app/home");
  await page.getByRole("button", { name: "More", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "FETCH AI Tutor" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Dark theme" }).click();
  await dialog.getByRole("link", { name: "Music Studio" }).click();
  await expect(page).toHaveURL(/\/music$/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("completed practice drives history, search and pack metadata", async ({
  page,
}) => {
  await page.goto("/app/home");
  await page.getByLabel("StudyPack name").fill("Biology revision");
  await page
    .getByLabel(/Paste your study material/)
    .fill(
      "Photosynthesis converts light energy into chemical energy in plants. Chlorophyll absorbs light most strongly in the blue and red portions of the visible spectrum. Carbon dioxide and water help plants produce glucose and oxygen.",
    );
  await page.getByRole("button", { name: /Generate/ }).click();
  await expect(page).toHaveURL(/study-packs\//);
  const pack = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("fetch-development-fixture-v1")!)
        .packs[0],
  );
  await page
    .locator("#app-main")
    .getByRole("link", { name: "Study", exact: true })
    .click();
  for (let i = 0; i < pack.questions.length; i++) {
    const q = pack.questions[i];
    if (q.type === "fill_blank")
      await page.getByLabel("Your answer", { exact: true }).fill(q.answer);
    else await page.getByRole("radio", { name: q.answer, exact: true }).check();
    await page
      .getByRole("button", { name: "Check answer", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: i === pack.questions.length - 1 ? "See results" : "Next question",
        exact: true,
      })
      .click();
  }
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View progress", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Study history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Biology revision/ }),
  ).toBeVisible();
  await page.goto("/app/study-packs");
  await page.getByLabel("Search StudyPacks", { exact: true }).fill("unknown");
  await expect(
    page.getByRole("heading", { name: "No matching StudyPacks" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(
    page.getByRole("heading", { name: "Biology revision" }),
  ).toBeVisible();
  await expect(page.getByText(/100% accuracy/)).toBeVisible();
});
test("clipboard controls and safe YouTube embed construction", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/app/friends");
  await page.getByRole("button", { name: "Copy username" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "@fetch_student",
  );
  await page.goto("/app/live");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  const code = await page.locator(".select-all").innerText();
  await page.getByRole("button", { name: "Copy room code" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  // External playback availability is deliberately not simulated as a success.
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({
      body: "<html><body>External player test boundary</body></html>",
      contentType: "text/html",
    }),
  );
  await page.goto("/app/music");
  await page.getByRole("button", { name: "YouTube", exact: true }).click();
  await page
    .getByLabel("YouTube URL")
    .fill("https://example.com/watch?v=M7lc1UVf-VE");
  await page.getByRole("button", { name: "Load player" }).click();
  await expect(page.locator("#app-main").getByRole("alert")).toContainText(
    "valid HTTPS YouTube",
  );
  await page.getByLabel("YouTube URL").fill("https://youtu.be/M7lc1UVf-VE");
  await page.getByRole("button", { name: "Load player" }).click();
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?autoplay=0",
  );
  await expect(
    page.getByRole("link", { name: "open on YouTube" }),
  ).toHaveAttribute("href", "https://www.youtube.com/watch?v=M7lc1UVf-VE");
  await page.getByRole("button", { name: "Close player" }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
});
test("pricing and event editor remain accessible", async ({ page }, info) => {
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (t) => localStorage.setItem("fetch-theme", t),
      theme,
    );
    await page.goto("/#pricing");
    await page.evaluate(() => document.fonts.ready);
    const pricing = await new AxeBuilder({ page })
      .include("#pricing")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(pricing.violations).toEqual([]);
    await page
      .locator("#pricing")
      .screenshot({
        path: `test-results/visual/pricing-${theme}-${info.project.name}.png`,
      });
    await page.goto("/app/calendar");
    await page.getByRole("button", { name: "New event", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("Biology exam");
    await page.getByLabel("End", { exact: true }).fill("07:00");
    await page.getByRole("button", { name: "Save event", exact: true }).click();
    await expect(page.locator("#app-main").getByRole("alert")).toContainText(
      "End time must be later",
    );
    await page.getByLabel("End", { exact: true }).fill("09:30");
    const editor = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(editor.violations).toEqual([]);
    await page.screenshot({
      path: `test-results/visual/calendar-editor-${theme}-${info.project.name}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});
