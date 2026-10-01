import { expect, test, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { createHash, randomUUID } from "node:crypto";

test("Live layout and Music contrast work in both app and system themes at four widths", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  test.setTimeout(180000);
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(value => localStorage.setItem("fetch-theme", value), theme);
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      for (const screen of ["live", "music", "pomodoro"]) {
        await page.goto(`/app/${screen}`);
        await expect(page.locator("h1")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${screen} ${width} ${theme}`).toBe(true);
        if (screen === "live") {
          await expect(page.getByRole("heading", { name: "Active Study Rooms" })).toBeVisible();
          await expect(page.getByRole("heading", { name: "Live Leaderboard" })).toBeVisible();
          await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
          await expect(page.getByRole("button", { name: "Create Live Room" })).toBeDisabled();
          const axe = await new AxeBuilder({ page }).include("#app-main").withTags(["wcag2a", "wcag2aa"]).analyze();
          expect(axe.violations.filter(v => v.impact === "critical" || v.impact === "serious")).toEqual([]);
          await page.screenshot({ path: `test-results/repair/live-${theme}-${width}.png`, fullPage: true });
        }
        if (screen === "music") {
          for (const systemTheme of ["light", "dark"] as const) {
            await page.emulateMedia({ colorScheme: systemTheme });
            const ratio = await page.locator(".music-hero h1").evaluate(element => {
              const luminance = (color: string) => {
                const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
                return .2126 * r + .7152 * g + .0722 * b;
              };
              const fg = luminance(getComputedStyle(element).color);
              const bg = luminance(innerWidth < 768 ? getComputedStyle(document.body).backgroundColor : "rgb(228,239,255)");
              return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
            });
            expect(ratio, `Music ${theme}/${systemTheme} ${width}`).toBeGreaterThanOrEqual(4.5);
          }
          await expect(page.locator("h1")).toHaveText("Your space to tune in.");
        }
        if (screen === "pomodoro") {
          await expect(page.locator(".pomodoro-hero")).toHaveCount(0);
          await expect(page.locator("h1")).toHaveText("Pomodoro Timer");
          await expect(page.getByRole("timer")).toBeVisible();
        }
      }
    }
  }
});

test("Month date cells, keyboard date buttons, event editing and all calendar views remain interactive", async ({ page }) => {
  await page.goto("/app/calendar");
  await page.getByRole("button", { name: "Month", exact: true }).click();
  const day = await page.locator(".calendar-month-cell [aria-current='date']").getAttribute("aria-label");
  const date = day!.replace("Add event on ", "");
  const cell = page.locator(`.calendar-month-cell[data-date='${date}']`);
  const cellBounds = await cell.boundingBox();
  await cell.click({ position: { x: 10, y: cellBounds!.height - 8 } });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("Month interaction verification");
  await page.getByLabel("All day", { exact: true }).check();
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await cell.getByRole("button", { name: /Month interaction verification/ }).click();
  await expect(page.getByRole("heading", { name: "Edit event" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("Updated Month verification");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  for (const view of ["Day", "Week", "Agenda", "Month"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(page.getByRole("button", { name: /Updated Month verification/ })).toBeVisible();
  }
  await page.getByRole("button", { name: day!, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "New event" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await cell.getByRole("button", { name: /Updated Month verification/ }).click();
  await page.getByRole("button", { name: "Delete event", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(cell.getByRole("button", { name: /Updated Month verification/ })).toHaveCount(0);
});

test("real host and guest can create, join, start, answer, complete and leave Live rooms", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  test.skip(!url || !key || !adminKey, "Run with node --env-file=.env.local for real account verification");
  test.setTimeout(180000);
  const admin = createClient(url!, adminKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const users: string[] = [];
  const contexts: BrowserContext[] = [];
  const roomIds: string[] = [];
  let packId: string | undefined;
  let deckPackId: string | undefined;
  async function account(label: string) {
    const email = `fetch-browser-${randomUUID()}@example.test`;
    const password = `${randomUUID()}Aa!9`;
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `Verification ${label}` } });
    if (result.error) throw result.error;
    users.push(result.data.user.id);
    const context = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
    contexts.push(context);
    const cookieJar: { name: string; value: string }[] = [];
    const client = createServerClient(url!, key!, { cookies: { getAll: () => cookieJar, setAll: values => { values.forEach(cookie => cookieJar.push({ name: cookie.name, value: cookie.value })); } } });
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    await context.addCookies(cookieJar.map(cookie => ({ ...cookie, url: "http://127.0.0.1:3000", sameSite: "Lax" as const })));
    const page = await context.newPage();
    await page.goto("/app/onboarding");
    await page.getByRole("button", { name: "Skip for now", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/home$/);
    return page;
  }
  try {
    const host = await account("host");
    const guest = await account("guest");
    await host.setViewportSize({ width: 390, height: 844 });
    await guest.setViewportSize({ width: 390, height: 844 });
    // Substitute only the AI job boundary. The resulting pack, artifact, cards,
    // authentication, workspace synchronization and client navigation are real.
    const deckResponse = await host.request.post("/api/flashcards/deck", { data: { title: "Fresh browser flashcards", cards: [{ front: "Cell nucleus", back: "Stores genetic instructions", aliases: [] }] } });
    expect(deckResponse.status()).toBe(201);
    deckPackId = (await deckResponse.json()).packId;
    let initialWorkspace = true;
    await host.route("**/api/workspace*", async route => {
      if (initialWorkspace && !new URL(route.request().url()).searchParams.has("packId")) {
        initialWorkspace = false;
        await route.fulfill({ json: { packs: [], events: [], attempts: [] } });
      } else await route.continue();
    });
    const jobId = randomUUID();
    await host.route("**/api/generate/job", route => route.fulfill({ json: { jobId, stage: "queued", status: "queued" } }));
    await host.route(`**/api/generate/job/${jobId}`, route => route.fulfill({ json: { jobId, status: "completed", stage: "completed", packId: deckPackId, acceptedCount: 1, requestedCount: 1, artifactKind: "flashcards" } }));
    await host.goto("/app/home#add-material");
    await host.getByRole("radio", { name: /Flashcards/ }).click();
    await host.getByLabel(/Paste your study material/).fill("The nucleus holds genetic instructions for the cell. Mitochondria produce energy and chloroplasts perform photosynthesis in plants.");
    await host.getByRole("button", { name: "Generate Flashcards", exact: true }).click();
    await expect(host).toHaveURL(new RegExp(`/app/study-packs/${deckPackId}$`));
    await expect(host.getByRole("heading", { name: "Fresh browser flashcards" })).toBeVisible();
    await expect(host.getByText("Cell nucleus", { exact: true })).toBeVisible();
    await host.unroute("**/api/workspace*");
    await host.goto("/app/study-packs");
    await host.getByRole("button", { name: "Flashcards", exact: true }).click();
    await expect(host.locator(".study-pack-card")).toHaveCount(1);
    await expect(host.locator(".study-pack-card")).toContainText("Fresh browser flashcards");
    await expect(host.locator(".study-pack-card").getByRole("link", { name: "Study Quiz" })).toHaveCount(0);

    const sent = await host.request.post("/api/friends/requests", { data: { recipientId: users[1] } });
    expect(sent.status()).toBe(201);
    await guest.goto("/app/friends");
    await guest.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(guest.getByRole("heading", { name: "Your friends (1)" })).toBeVisible();
    await expect(guest.locator(".friends-circle")).toContainText("You have 1 study buddy.");
    await guest.screenshot({ path: "test-results/mobile-review/friends-real-account-390.png", fullPage: true });
    await host.goto("/app/tutor");
    await expect(host.getByLabel("Your question")).toBeVisible();
    await expect(host.getByRole("button", { name: "Show StudyPack context & past conversations" })).toBeVisible();
    await host.screenshot({ path: "test-results/mobile-review/tutor-real-account-390.png", fullPage: true });
    const source = "The nucleus stores genetic instructions. Mitochondria provide energy. Chloroplasts carry out photosynthesis in plant cells.";
    const fixture = await admin.rpc("create_study_pack", { p_title: "Isolated browser Live verification", p_source_type: "text", p_source_label: "Verification", p_source_content: source, p_content_hash: createHash("sha256").update(source).digest("hex"), p_owner_id: users[0], p_questions: ["Nucleus", "Mitochondria", "Chloroplasts"].map(answer => ({ kind: "multiple_choice", prompt: `Choose ${answer}`, choices: [answer, "Other"], answer, explanation: "Verification", sourceQuote: source })) });
    if (fixture.error) throw fixture.error;
    packId = fixture.data.id;
    await host.goto("/app/live");
    await expect(host.getByRole("button", { name: "Create Live Room" })).toBeEnabled();
    await host.getByRole("radio", { name: /Private/ }).press("Space");
    await host.getByRole("radio", { name: "2 players" }).press("Space");
    const created = host.waitForResponse(response => response.url().endsWith("/api/live/rooms") && response.request().method() === "POST");
    await host.getByRole("button", { name: "Create Live Room" }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    const room = await response.json();
    roomIds.push(room.roomId);
    await expect(host.getByRole("heading", { name: "Waiting for players..." })).toBeVisible();
    await guest.goto("/app/live");
    await expect(guest.locator(".live-room-list li").filter({ hasText: "Isolated browser Live verification" })).toHaveCount(0);
    await guest.getByRole("button", { name: "Join a room", exact: true }).click();
    await guest.getByLabel("Room code", { exact: true }).fill(room.joinCode);
    await guest.getByRole("button", { name: "Join Room", exact: true }).click();
    await expect(guest.getByRole("heading", { name: "Waiting for players..." })).toBeVisible();
    await expect(host.getByText("Players in Room (2)")).toBeVisible();
    await host.getByRole("button", { name: "Start Competition" }).click();
    for (const answer of ["Nucleus", "Mitochondria", "Chloroplasts"]) {
      await expect(guest.getByRole("heading", { name: `Choose ${answer}` })).toBeVisible();
      await host.getByRole("button", { name: answer, exact: true }).click();
      await guest.getByRole("button", { name: answer, exact: true }).click();
      await expect(guest.getByRole("button", { name: answer, exact: true })).toBeDisabled();
      await host.getByRole("button", { name: "Next Question" }).click();
    }
    await expect(host.getByRole("heading", { name: "Competition Finished!" })).toBeVisible();
    await expect(guest.getByRole("heading", { name: "Competition Finished!" })).toBeVisible();
    await host.getByRole("button", { name: "Back to Live Home" }).click();
    await guest.getByRole("button", { name: "Back to Live Home" }).click();
    await host.getByRole("radio", { name: /Public/ }).press("Space");
    const publicCreated = host.waitForResponse(response => response.url().endsWith("/api/live/rooms") && response.request().method() === "POST");
    await host.getByRole("button", { name: "Create Live Room" }).click();
    const publicRoom = await (await publicCreated).json();
    roomIds.push(publicRoom.roomId);
    await guest.getByRole("button", { name: "Refresh active rooms" }).click();
    const publicRow = guest.locator(".live-room-list li").filter({ hasText: "Isolated browser Live verification" });
    await expect(publicRow).toBeVisible();
    await publicRow.getByRole("button", { name: "Join", exact: true }).click();
    await expect(guest.getByRole("heading", { name: "Waiting for players..." })).toBeVisible();
    await guest.getByRole("button", { name: "Leave Room", exact: true }).click();
    await expect(host.getByText("Players in Room (1)")).toBeVisible();
    await host.getByRole("button", { name: "Leave Room", exact: true }).click();
    const closed = await admin.from("live_rooms").select("status").eq("id", publicRoom.roomId).single();
    expect(closed.data?.status).toBe("complete");
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    for (const id of roomIds) await admin.from("live_rooms").delete().eq("id", id);
    if (packId) await admin.from("study_packs").delete().eq("id", packId);
    if (deckPackId) await admin.from("study_packs").delete().eq("id", deckPackId);
    for (const id of users) await admin.auth.admin.deleteUser(id);
  }
});
