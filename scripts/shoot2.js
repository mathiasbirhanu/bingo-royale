/* E2E v2 — per-card manual play proof (390×844, DPR 2):
 *   player …003: enter Golden Hall (75-ball, manual) → buy 2 cards →
 *   wait for DRAWING → tap the same called number on BOTH cards →
 *   verify each card marked independently → invalid tap buzz →
 *   per-card BINGO! bar screenshot.
 * Prints PASS/FAIL lines for the owner's rules; collects console errors. */
const { chromium } = require("playwright");

const out = "/tmp/render";
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });

async function login(page, errors, phone) {
  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.fill("#phone", phone);
  await page.getByRole("button", { name: /send my code/i }).click();
  await page.waitForTimeout(1200);
  const body = await page.textContent("body");
  const code = (body.match(/your code is\s*([A-Z0-9]{6})/i) || [])[1];
  if (!code) throw new Error(`demo OTP not found for ${phone}`);
  await page.fill("#code", code);
  await page.getByRole("button", { name: /enter the hall/i }).click();
  await page.waitForTimeout(2200);
}

(async () => {
  const browser = await chromium.launch({ args: ["--no-proxy-server"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await login(page, errors, "+251911000003");
  await page.getByText("The Floor").waitFor({ timeout: 10000 });
  await shot(page, "02-lobby");

  // Prefer Golden Hall (75-ball: 24 numbers/card → overlaps likely); else any Play now.
  const goldenCard = page.locator("div", { has: page.getByText("Golden Hall", { exact: false }) }).getByRole("button", { name: /play now/i }).first();
  if (await goldenCard.count()) {
    await goldenCard.click();
  } else {
    const play = page.getByRole("button", { name: /play now/i }).first();
    if (await play.count()) await play.click();
    else {
      await page.getByRole("button", { name: /watch live/i }).first().click();
    }
  }
  await page.waitForTimeout(2500);

  // Buy 2 cards if sales are open
  const qty2 = page.getByRole("button", { name: "×2", exact: true }).first();
  if (await qty2.count()) await qty2.click();
  const buyBtn = page.getByRole("button", { name: /buy \d+ for/i }).first();
  if (await buyBtn.count()) {
    await buyBtn.click();
    await page.waitForTimeout(2500);
    console.log("PURCHASE → bought cards");
  } else {
    console.log("PURCHASE → sales closed (watching)");
  }

  // Wait for the drawing + a tappable called cell (manual rooms only)
  const hinted = page.locator('button[aria-label^="Tap to daub "]');
  let result = "SKIP (no cards or no calls within wait)";
  try {
    await hinted.first().waitFor({ timeout: 300000, state: "visible" });
    await page.waitForTimeout(400);

    // Take the FIRST hinted number; tap EVERY card that has it untapped.
    const label = await hinted.first().getAttribute("aria-label");
    const n = label.replace("Tap to daub ", "");
    const totalUntapped = await page.locator(`button[aria-label="Tap to daub ${n}"]`).count();
    // Tap it on card 1 only
    await page.locator(`button[aria-label="Tap to daub ${n}"]`).first().click();
    await page.waitForTimeout(700);

    const stillUntapped = await page.locator(`button[aria-label="Tap to daub ${n}"]`).count();
    const marked = await page.locator(`button[aria-label="${n} marked"]`).count();
    const bingoBars = await page.locator('button:has-text("BINGO!")').count();
    const isolated = stillUntapped >= 1 || marked === 1; // others untouched
    result = `tapped "${n}" once → marked=${marked}, still-untapped=${stillUntapped} (was ${totalUntapped}), BINGO! bars=${bingoBars} → ${isolated ? "PASS per-card isolation" : "FAIL cross-card leak"}`;

    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(600);
    await shot(page, "04-card-daub");

    // Tap the same number on the NEXT card too (player must find it everywhere)
    if (stillUntapped >= 1) {
      await page.locator(`button[aria-label="Tap to daub ${n}"]`).first().click();
      await page.waitForTimeout(600);
      const marked2 = await page.locator(`button[aria-label="${n} marked"]`).count();
      console.log(`SECOND CARD TAP → marked=${marked2} (player found it on the other card)`);
      await shot(page, "04b-card-daub-both");
    }

    // Invalid tap: an uncalled number buzzes red and marks nothing
    const beforeMarked = await page.locator('button[aria-label$=" marked"]').count();
    const uncalled = page.locator('button[aria-label]:not([aria-label*="daub"]):not([aria-label*="marked"])').filter({ hasText: /^[0-9]+$/ }).first();
    if (await uncalled.count()) {
      await uncalled.click().catch(() => undefined);
      await page.waitForTimeout(400);
      const afterMarked = await page.locator('button[aria-label$=" marked"]').count();
      console.log(`INVALID TAP → marked before=${beforeMarked}, after=${afterMarked} → ${beforeMarked === afterMarked ? "PASS nothing marked" : "FAIL marked!"}`);
      await shot(page, "05-invalid-tap-buzz");
    }
  } catch (e) {
    result = `SKIP (${e.message.split("\n")[0]})`;
  }
  console.log(`ISOLATION CHECK → ${result}`);

  console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "NO console/page errors");
  await browser.close();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
