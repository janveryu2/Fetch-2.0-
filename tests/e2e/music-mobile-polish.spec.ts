import { expect, test, type Page } from "@playwright/test";
import {
  CURATED_TRACKS,
  STUDY_MOODS,
  tracksForMood,
} from "../../src/lib/music/curated-tracks";

// Replace only the external media boundary; exercise the real player and catalog.
function silentWav(seconds = 120) {
  const samples = 8000 * seconds;
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
  return wav;
}

async function goHome(page: Page) {
  const navigation = page.getByRole("navigation", {
    name: "Mobile navigation",
    exact: true,
  });
  if (await navigation.isVisible())
    await navigation.getByRole("link", { name: "Home", exact: true }).click();
  else
    await page
      .locator(".fetch-sidebar")
      .getByRole("link", { name: "Home", exact: true })
      .click();
  await expect(page).toHaveURL(/\/app\/home/);
}

test("every researched mood has ten items, distinct covers, source links and working search", async ({
  page,
}) => {
  await page.goto("/app/music");
  await expect(page.locator(".music-now-art img")).toBeVisible();
  for (const mood of STUDY_MOODS) {
    await page.getByRole("button", { name: mood, exact: true }).click();
    const count = tracksForMood(mood).length;
    expect(count).toBeGreaterThanOrEqual(10);
    await page
      .getByRole("button", { name: `View all ${count} items`, exact: true })
      .click();
    const cards = page.locator("#music-curated .music-media-card");
    await expect(cards).toHaveCount(count);
    const covers = await cards
      .locator("img")
      .evaluateAll((images) =>
        images.map((image) => image.getAttribute("src")),
      );
    expect(new Set(covers).size).toBeGreaterThanOrEqual(10);
    expect(
      await cards
        .locator("a")
        .evaluateAll((links) =>
          links.every((link) =>
            /^https:\/\//.test(link.getAttribute("href") ?? ""),
          ),
        ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "All music", exact: true }).click();
  await page.getByLabel("Search study music").fill("groove salad");
  await expect(page.locator("#music-curated .music-media-card")).toHaveCount(3);
  await page
    .getByLabel("Search study music")
    .fill("No matching verification track");
  await expect(
    page.getByText("No matching music. Try another title or creator."),
  ).toBeVisible();
});

test("native audio stays compact, movable, synchronized and mounted across navigation", async ({
  page,
}) => {
  const stream = CURATED_TRACKS.find((track) => track.audioUrl)!;
  await page.route(stream.audioUrl!, (route) =>
    route.fulfill({ contentType: "audio/wav", body: silentWav() }),
  );
  await page.goto("/app/music");
  await page.locator("#music-curated .music-media-play").first().click();
  const dock = page.getByRole("region", {
    name: "Study audio player",
    exact: true,
  });
  await expect(dock).toBeVisible();
  const audio = page.locator("audio");
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(false);
  expect((await dock.boundingBox())!.height).toBeLessThanOrEqual(80);
  await page.getByRole("button", { name: "Pause music", exact: true }).click();
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(true);
  await dock.getByRole("button", { name: "Play dock audio" }).click();
  await expect(
    page.getByRole("button", { name: "Pause music", exact: true }),
  ).toBeVisible();
  const queueButton = page.locator(".music-track-main").first();
  await queueButton.focus();
  await audio.evaluate((element: HTMLAudioElement) => {
    element.currentTime = 2;
    element.dispatchEvent(new Event("timeupdate"));
  });
  await expect(queueButton).toBeFocused();
  await page.getByLabel("Volume level").press("Home");
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.volume))
    .toBe(0);
  const handle = dock.getByRole("button", { name: "Move audio player" });
  const before = (await dock.boundingBox())!;
  await handle.press("ArrowUp");
  await expect
    .poll(async () => (await dock.boundingBox())!.y)
    .toBeLessThan(before.y - 10);
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(-500, -500, { steps: 6 });
  await page.mouse.up();
  const moved = (await dock.boundingBox())!;
  expect(moved.x).toBeGreaterThanOrEqual(12);
  expect(moved.y).toBeGreaterThanOrEqual(12);
  await handle.press("Home");
  await dock.getByRole("button", { name: "Show player controls" }).click();
  await expect(audio).toBeVisible();
  await dock.getByRole("button", { name: "Hide player controls" }).click();
  await audio.evaluate((element) =>
    element.setAttribute("data-navigation-identity", "persistent-audio"),
  );
  await goHome(page);
  await expect(audio).toHaveAttribute(
    "data-navigation-identity",
    "persistent-audio",
  );
  await expect(audio).toHaveAttribute("src", stream.audioUrl!);
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(false);
  const navigation = page.getByRole("navigation", {
    name: "Mobile navigation",
    exact: true,
  });
  if (await navigation.isVisible())
    expect(
      (await dock.boundingBox())!.y + (await dock.boundingBox())!.height,
    ).toBeLessThan((await navigation.boundingBox())!.y);
  await dock.getByRole("button", { name: "Stop study stream" }).click();
  await expect(dock).toBeHidden();
});

test("YouTube minimizes by pausing, resumes, moves and survives route changes", async ({
  page,
}) => {
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><body><script>
      window.commands = [];
      window.addEventListener('message', event => {
        const data = JSON.parse(event.data);
        if (data.event === 'listening') parent.postMessage(JSON.stringify({ event: 'onStateChange', info: 1 }), '*');
        if (data.func) {
          window.commands.push(data.func);
          if (data.func === 'pauseVideo' || data.func === 'playVideo') parent.postMessage(JSON.stringify({ event: 'onStateChange', info: data.func === 'playVideo' ? 1 : 2 }), '*');
        }
      });
    </script>External playback boundary</body></html>`,
    }),
  );
  await page.goto("/app/music");
  await page.getByRole("button", { name: "Classical", exact: true }).click();
  await page.locator("#music-curated .music-media-play").first().click();
  const dock = page.getByRole("region", {
    name: "Study stream player",
    exact: true,
  });
  const frame = page.locator("iframe");
  await expect(
    page.getByRole("button", { name: "Pause music", exact: true }),
  ).toBeVisible();
  const src = await frame.getAttribute("src");
  await frame.evaluate((element) =>
    element.setAttribute("data-navigation-identity", "persistent-video"),
  );
  await dock
    .getByRole("button", { name: "Minimize and pause study stream" })
    .click();
  await expect(frame).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Play music", exact: true }),
  ).toBeVisible();
  expect((await dock.boundingBox())!.height).toBeLessThanOrEqual(80);
  const handle = dock.getByRole("button", { name: "Move music player" });
  const before = (await dock.boundingBox())!;
  await handle.press("ArrowUp");
  expect((await dock.boundingBox())!.y).toBeLessThan(before.y);
  await goHome(page);
  await expect(frame).toHaveAttribute(
    "data-navigation-identity",
    "persistent-video",
  );
  await expect(frame).toHaveAttribute("src", src!);
  await dock
    .getByRole("button", { name: "Expand and resume study stream" })
    .click();
  await expect(frame).toBeVisible();
  expect((await frame.boundingBox())!.width).toBeGreaterThanOrEqual(200);
  expect((await frame.boundingBox())!.height).toBeGreaterThanOrEqual(200);
  const child = frame.contentFrame();
  await expect
    .poll(() =>
      child
        .locator("body")
        .evaluate(() => (window as unknown as { commands: string[] }).commands),
    )
    .toContain("pauseVideo");
  await expect
    .poll(() =>
      child
        .locator("body")
        .evaluate(() => (window as unknown as { commands: string[] }).commands),
    )
    .toContain("playVideo");
  await dock.getByRole("button", { name: "Stop study stream" }).click();
  await expect(frame).toHaveCount(0);
});

test("headings have no painted backings and compact timer artwork fits above controls", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  test.setTimeout(180_000);
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (value) => localStorage.setItem("fetch-theme", value),
      theme,
    );
    for (const width of [360, 390, 768, 834, 1024, 1194, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto("/app/home");
      const greeting = page.locator(".home-topbar");
      await expect(greeting.locator("h1")).toBeVisible();
      for (const heading of await greeting.locator("h1,p").all())
        expect(
          await heading.evaluate(
            (element) => getComputedStyle(element).backgroundColor,
          ),
        ).toBe("rgba(0, 0, 0, 0)");
      await page.goto("/app/pomodoro");
      await expect(page.getByRole("timer")).toBeVisible();
      const art = page.locator(".pomodoro-mobile-art img");
      if (width < 1280) {
        await expect(art).toBeVisible();
        await expect
          .poll(() =>
            art.evaluate((element: HTMLImageElement) => element.naturalWidth),
          )
          .toBeGreaterThan(0);
        const image = (await art.boundingBox())!;
        expect(image.width / image.height).toBeCloseTo(1586 / 992, 1);
        const timer = (await page.locator(".pomodoro-dial").boundingBox())!;
        const actions = (await page
          .locator(".pomodoro-actions")
          .boundingBox())!;
        expect(image.y).toBeGreaterThanOrEqual(timer.y + timer.height);
        expect(image.y + image.height).toBeLessThan(actions.y);
      } else await expect(art).toBeHidden();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      await page.goto("/app/music");
      const copy = page.locator(".music-hero > div").first();
      expect(
        await copy.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      ).toBe("rgba(0, 0, 0, 0)");
    }
  }
});

test("More shares desktop artwork and timer completion is dismissible off its page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "fetch-focus-v1:demo",
      JSON.stringify({
        mode: "Focus",
        durations: { Focus: 25, "Short break": 5, "Long break": 15 },
        remaining: 0,
        endAt: null,
        completed: true,
        packId: "",
      }),
    );
    localStorage.setItem("fetch-timer-sound", "false");
  });
  await page.goto("/app/pomodoro");
  await expect(page.getByRole("timer")).toHaveText("00:00");
  await expect(page.locator(".timer-mini")).toHaveCount(0);
  await goHome(page);
  await expect(page.locator(".timer-mini")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss timer completion" }).click();
  await expect(page.locator(".timer-mini")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "More", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Your workspace" });
  await expect(sheet).toBeVisible();
  expect(
    await sheet.locator(".fetch-more-grid img").count(),
  ).toBeGreaterThanOrEqual(10);
  expect(
    await sheet
      .locator(".fetch-more-grid img")
      .evaluateAll((images) =>
        images.every((image) =>
          decodeURIComponent(image.getAttribute("src") ?? "").includes(
            "/assets/icons/nav/",
          ),
        ),
      ),
  ).toBe(true);
  await expect(
    sheet.locator(".fetch-more-account img[src*='mascot']"),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});
