import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const cards = [
  {
    id: "card-1",
    front: "What were the two main factions in World War II?",
    back: "Allies and Axis",
    aliases: ["the Allies and the Axis"],
    position: 0,
  },
  {
    id: "card-2",
    front: "When did World War II last?",
    back: "1939 to 1945",
    aliases: [],
    position: 1,
  },
];

function contrastRatio(foreground: string, background: string) {
  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    if (!channels || channels.length !== 3) throw new Error(`Invalid color: ${color}`);
    const [r, g, b] = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function deckBoundary(page: Page, single = false) {
  await page.route("**/api/artifacts/visual-deck/cards", (route) =>
    route.fulfill({ json: { cards: single ? cards.slice(0, 1) : cards } }),
  );
  await page.route("**/api/flashcards/session", (route) =>
    route.fulfill({ json: { sessionId: "visual-session" } }),
  );
  await page.route("**/api/flashcards/attempt", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
}

async function openManualDeck(page: Page) {
  await page.goto("/app/home#add-material");
  await page.getByRole("radio", { name: /Flashcards/ }).click();
  await page.getByRole("button", { name: "Create Manual Deck" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("approved screens fit four widths and both themes", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  test.setTimeout(240_000);
  await deckBoundary(page);
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (t) => localStorage.setItem("fetch-theme", t),
      theme,
    );
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      for (const screen of [
        "home",
        "pomodoro",
        "music",
        "flashcards",
        "manual-deck",
      ]) {
        if (screen === "manual-deck") await openManualDeck(page);
        else
          await page.goto(
            screen === "flashcards"
              ? "/app/study-flashcards/visual-deck?packId=visual-pack&title=History"
              : `/app/${screen}`,
          );
        await expect(
          screen === "manual-deck"
            ? page.getByRole("dialog")
            : page.locator("h1"),
        ).toBeAttached();
        if (screen === "flashcards")
          await expect(
            page.getByRole("button", { name: "Card front, click to flip" }),
          ).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${screen} ${theme} ${width} overflow`,
        ).toBe(true);
        if (screen === "manual-deck") {
          const bounds = await page.getByRole("dialog").boundingBox();
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.width).toBeLessThanOrEqual(width);
          await expect(
            page.getByRole("button", { name: "Save Deck" }),
          ).toBeVisible();
        }
        if (width === 390 || width === 1440) {
          const axe = await new AxeBuilder({ page })
            .include(screen === "manual-deck" ? '[role="dialog"]' : "#app-main")
            .withTags(["wcag2a", "wcag2aa"])
            .analyze();
          expect
            .soft(
              axe.violations.filter(
                (v) => v.impact === "critical" || v.impact === "serious",
              ),
              `${screen} ${theme} ${width} accessibility`,
            )
            .toEqual([]);
        }
        await page.screenshot({
          path: `test-results/approved-ui/${screen}-${theme}-${width}.png`,
          fullPage: false,
        });
        if (screen === "manual-deck") await page.keyboard.press("Escape");
      }
    }
  }
});

test("Pomodoro timer, tip mascot and Home search remain clear across themes and widths", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  test.setTimeout(120_000);

  await page.goto("/app/pomodoro");
  await expect(page.getByRole("timer")).toBeVisible();
  const widths = [390, 768, 1024, 1440];

  for (const systemTheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: systemTheme });
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((value) => {
        localStorage.setItem("fetch-theme", value);
        document.documentElement.dataset.theme = value;
      }, theme);

      for (const width of widths) {
        await page.setViewportSize({ width, height: 960 });
        for (const mode of ["Focus", "Short Break", "Long Break"]) {
          await page.getByRole("button", { name: mode, exact: true }).click();
          const colors = await page.locator(".pomodoro-stage").evaluate((stage) => {
            const timer = stage.querySelector<HTMLElement>('[role="timer"]');
            const dial = timer?.parentElement?.parentElement;
            const label = timer?.previousElementSibling;
            const status = timer?.nextElementSibling?.nextElementSibling;
            if (!timer || !dial || !label || !status) {
              throw new Error("Pomodoro timer text or dial is missing");
            }
            return {
              timer: getComputedStyle(timer).color,
              label: getComputedStyle(label).color,
              status: getComputedStyle(status).color,
              dial: getComputedStyle(dial).backgroundColor,
            };
          });
          expect(contrastRatio(colors.timer, colors.dial)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(colors.label, colors.dial)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(colors.status, colors.dial)).toBeGreaterThanOrEqual(4.5);
        }

        const card = page.locator(".pomodoro-study-tip");
        const bounds = await card.boundingBox();
        const mascot = card.locator(".pomodoro-tip-mascot");
        const mascotBounds = await mascot.boundingBox();
        const copyBounds = await card
          .locator(".pomodoro-study-tip-body p")
          .boundingBox();
        expect(bounds).not.toBeNull();
        expect(mascotBounds).not.toBeNull();
        expect(mascotBounds!.x).toBeGreaterThanOrEqual(bounds!.x + 8);
        expect(mascotBounds!.x + mascotBounds!.width).toBeLessThanOrEqual(
          bounds!.x + bounds!.width - 8,
        );
        expect(copyBounds!.x + copyBounds!.width).toBeLessThanOrEqual(
          mascotBounds!.x + 1,
        );
        expect(
          await mascot.evaluate((image: HTMLImageElement) => image.naturalWidth),
        ).toBeGreaterThan(0);
        expect(
          await card.evaluate((element) => getComputedStyle(element).overflow),
        ).not.toBe("hidden");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
      }
    }
  }

  await page.goto("/app/home");
  const search = page.getByRole("textbox", { name: "Search your StudyPacks" });
  await expect(search).toBeVisible();
  for (const systemTheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: systemTheme });
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((value) => {
        localStorage.setItem("fetch-theme", value);
        document.documentElement.dataset.theme = value;
      }, theme);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 960 });
        await search.focus();
        const focus = await search.evaluate((input) => ({
          keyboardFocus: input.matches(":focus-visible"),
          outline: getComputedStyle(input).outlineStyle,
          ring: getComputedStyle(input.parentElement!).boxShadow,
        }));
        expect(focus.keyboardFocus).toBe(true);
        expect(focus.outline).toBe("none");
        expect(focus.ring).not.toBe("none");
        await search.click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
      }
    }
  }
  await expect(page.getByText("AI-powered", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Personalized", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Better results", { exact: true })).toHaveCount(0);
});

test("manual deck retains editing, aliases, add/delete, focus and save payload", async ({
  page,
}) => {
  let payload: unknown;
  await page.route("**/api/flashcards/deck", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ json: { packId: "saved-manual-deck" } });
  });
  await openManualDeck(page);
  await expect(page.getByLabel("Deck title")).toBeFocused();
  await page.getByLabel("Deck title").fill("Biology revision");
  await expect(page.getByText("16/100", { exact: true })).toBeVisible();
  await page
    .getByLabel("Front (Prompt / Term)")
    .first()
    .fill("Powerhouse of the cell?");
  await page
    .getByLabel("Back (Answer / Definition)")
    .first()
    .fill("Mitochondria");
  await page
    .getByLabel("Accepted aliases")
    .first()
    .fill("mitochondrion, powerhouse");
  await page.getByRole("button", { name: "Add Card" }).click();
  await expect(page.getByRole("heading", { name: "Cards (3)" })).toBeVisible();
  await page.getByRole("button", { name: "Remove card 3" }).click();
  await page.getByRole("button", { name: "Remove card 2" }).click();
  await expect(
    page.getByRole("button", { name: "Remove card 1" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Save Deck" }).click();
  await expect(page).toHaveURL(/study-packs\/saved-manual-deck/);
  expect(payload).toEqual({
    title: "Biology revision",
    cards: [
      {
        front: "Powerhouse of the cell?",
        back: "Mitochondria",
        aliases: ["mitochondrion", "powerhouse"],
      },
    ],
  });
});

test("manual deck closes with Escape and restores focus", async ({ page }) => {
  await openManualDeck(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create Manual Deck" }),
  ).toBeFocused();
});

test("flashcard flip, typed recall, explicit next and delayed retry preserve mastery", async ({
  page,
}) => {
  await deckBoundary(page);
  const submissions: unknown[] = [];
  await page.route("**/api/flashcards/attempt", (route) => {
    submissions.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/app/study-flashcards/visual-deck?packId=visual-pack");
  const card = page.getByRole("button", { name: "Card front, click to flip" });
  await card.focus();
  await page.keyboard.press("Space");
  expect(
    await page.locator(".flashcard-flipper").evaluate((element) =>
      element
        .getAnimations()
        .map((animation) => animation.effect?.getTiming().duration),
    ),
  ).toContain(480);
  await expect(
    page.getByRole("button", { name: /Card back revealed/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Flip card", exact: true }).click();
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await card.click();
  await expect(
    page.getByRole("button", { name: /Card back revealed/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Flip card", exact: true }).click();
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Peek answer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Card back revealed/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Type your recall response").fill("wrong");
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(
    page.getByRole("heading", { name: "Keep practicing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Check answer" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Hard/ }).click();
  await page.getByRole("button", { name: "Next card" }).click();
  await expect(
    page.getByRole("heading", { name: "When did World War II last?" }),
  ).toBeVisible();
  await page.getByLabel("Type your recall response").fill("1939 to 1945");
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(
    page.getByRole("heading", { name: "Correct!", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next card" }).click();
  await expect(
    page.getByRole("heading", { name: cards[0].front }),
  ).toBeVisible();
  await page
    .getByLabel("Type your recall response")
    .fill("the Allies and the Axis");
  await page.getByRole("button", { name: "Check answer" }).click();
  await page.getByRole("button", { name: "Next card" }).click();
  await expect(
    page.getByRole("heading", { name: "Deck Mastered!" }),
  ).toBeVisible();
  await expect(page.getByText("50%", { exact: true })).toBeVisible();
  expect(submissions).toHaveLength(3);
});

test("three misses retains continue and incomplete session paths", async ({
  page,
}) => {
  await deckBoundary(page, true);
  await page.goto("/app/study-flashcards/visual-deck?packId=visual-pack");
  for (let i = 0; i < 3; i++) {
    await page.getByLabel("Type your recall response").fill("wrong");
    await page.getByRole("button", { name: "Check answer" }).click();
    if (i < 2) await page.getByRole("button", { name: "Next card" }).click();
  }
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Continue studying", exact: true })
    .click();
  await page.getByLabel("Type your recall response").fill("wrong again");
  await page.getByRole("button", { name: "Check answer" }).click();
  await page.getByRole("button", { name: "End session as incomplete" }).click();
  await expect(
    page.getByRole("heading", { name: "Session Summary" }),
  ).toBeVisible();
});

test("flip respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await deckBoundary(page);
  await page.goto("/app/study-flashcards/visual-deck");
  await expect(page.locator(".flashcard-flipper")).toBeVisible();
  await page
    .getByRole("button", { name: "Card front, click to flip" })
    .click();
  await expect(
    page.getByRole("button", { name: /Card back revealed/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.locator(".flashcard-flipper").evaluate((element) =>
      element.getAnimations().length,
    ),
  ).toBe(0);
  expect(
    parseFloat(
      await page
        .locator(".flashcard-flipper")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ),
  ).toBeLessThan(0.001);
});

test("Pomodoro controls preserve countdown across navigation and refresh", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/app/pomodoro");
  const settings = page.getByRole("button", { name: "Timer settings", exact: true });
  if (await settings.isVisible()) await settings.click();
  await page.getByLabel("Focus duration (minutes)").fill("1");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.clock.fastForward(10_000);
  await expect(page.getByRole("timer")).toHaveText("00:50");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.clock.fastForward(10_000);
  await expect(page.getByRole("timer")).toHaveText("00:50");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page
    .getByRole("link", { name: /Music(?: Studio)?/ })
    .filter({ visible: true })
    .first()
    .click();
  await page.clock.fastForward(10_000);
  await page.goto("/app/pomodoro");
  const remainingSeconds = async () => {
    const text = await page.getByRole("timer").innerText();
    const [minutes, seconds] = text.split(":").map(Number);
    return minutes * 60 + seconds;
  };
  await expect.poll(remainingSeconds).toBeLessThan(60);
  const beforeReload = await remainingSeconds();
  expect(beforeReload).toBeGreaterThan(0);
  expect(beforeReload).toBeLessThanOrEqual(40);
  await page.reload();
  await expect.poll(remainingSeconds).toBeLessThanOrEqual(beforeReload);
  const afterReload = await remainingSeconds();
  expect(afterReload).toBeGreaterThan(0);
  expect(afterReload).toBeLessThanOrEqual(beforeReload);
  await page.clock.fastForward(41_000);
  await expect(page.getByRole("timer")).toHaveText("00:00");
  await expect(page.locator(".pomodoro-timer-status")).toHaveText(
    "Session complete",
  );
  await expect(
    page.getByRole("button", { name: "Prepare a break" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Prepare a break" }).click();
  await expect(page.getByRole("timer")).toHaveText("05:00");
});

test("local music plays, seeks, switches tracks and persists across navigation", async ({
  page,
}) => {
  await page.goto("/app/music");
  const samples = 8000 * 8;
  await page.getByRole("button", { name: "Local files", exact: true }).click();
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
  await page.getByRole("button", { name: "Play music", exact: true }).click();
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false);
  await page.getByRole("button", { name: "Pause music", exact: true }).click();
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await page.getByLabel("Volume level").press("Home");
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.volume)).toBe(0);
  await audio.evaluate(async (el: HTMLAudioElement) => {
    await el.play();
  });
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.paused))
    .toBe(false);
  await audio.evaluate((el: HTMLAudioElement) => {
    el.pause();
    el.currentTime = 2;
    el.volume = 0.4;
  });
  expect(
    await audio.evaluate((el: HTMLAudioElement) => el.currentTime),
  ).toBeGreaterThanOrEqual(2);
  expect(await audio.evaluate((el: HTMLAudioElement) => el.volume)).toBe(0.4);
  await expect(page.getByLabel("Volume level")).toHaveValue("40");
  const dock = page.getByRole("region", { name: "Now playing", exact: true });
  await dock.getByRole("button", { name: "Next track" }).click();
  await expect(dock).toContainText("Break.wav");
  await dock.getByRole("button", { name: "Previous track" }).click();
  const src = await audio.getAttribute("src");
  await page
    .getByRole("link", { name: /Pomodoro(?: Timer)?/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(audio).toHaveAttribute("src", src!);
  await dock.getByRole("button", { name: "Clear local playlist" }).click();
  await expect(audio).toHaveCount(0);
});

test("YouTube and curated music keep the persistent external player", async ({
  page,
}) => {
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>External playback boundary</body></html>",
    }),
  );
  await page.goto("/app/music");
  await page
    .getByRole("button", { name: "YouTube audio", exact: true })
    .click();
  await page
    .getByLabel("YouTube video URL")
    .fill("https://example.com/watch?v=M7lc1UVf-VE");
  await page.getByRole("button", { name: /Extract audio/ }).click();
  await expect(page.locator("#app-main").getByRole("alert")).toBeVisible();
  await page
    .getByLabel("YouTube video URL")
    .fill("https://youtu.be/M7lc1UVf-VE");
  await page.getByRole("button", { name: /Extract audio/ }).click();
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    /youtube-nocookie\.com\/embed\/M7lc1UVf-VE/,
  );
  await page
    .getByRole("link", { name: /Pomodoro(?: Timer)?/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.locator("iframe")).toHaveCount(1);
  await page.getByRole("button", { name: "Stop study stream" }).click();
  await page.goto("/app/music");
  await page.getByRole("button", { name: "Play music", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(1);
});
