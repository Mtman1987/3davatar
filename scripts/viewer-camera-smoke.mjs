import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const output = "test-results";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:8080/", { waitUntil: "commit", timeout: 15_000 });

  // Wait for layout/font settling before interacting with the home screen. The page can
  // otherwise keep shifting while Playwright is trying to establish a stable click target.
  await page.evaluate(() => document.fonts.ready);
  // Apply the actual sample portrait from the home screen; this exercises face detection/fitting.
  const sampleButton = page.getByRole("button", { name: /try the sample portrait/i });
  await sampleButton.waitFor({ state: "visible", timeout: 30_000 });
  await sampleButton.scrollIntoViewIfNeeded();
  await sampleButton.click({ timeout: 60_000 });
  await page.getByRole("button", { name: "Face", exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector("canvas")?.getBoundingClientRect().width > 0, null, { timeout: 30_000 });
  await page.waitForTimeout(3000);

  const results = [];
  for (const body of ["Male", "Female"]) {
    await page.getByRole("button", { name: "Body", exact: true }).click();
    await page.getByRole("button", { name: new RegExp("^" + body + "$") }).click();
    await page.getByRole("button", { name: "Face", exact: true }).click();
    await page.waitForTimeout(5000);
    const path = `${output}/sample-face-fit-${body.toLowerCase()}.png`;
    await page.screenshot({ path, fullPage: true });
    results.push({ body, screenshot: path, canvasVisible: await page.locator("canvas").first().isVisible() });
  }

  await writeFile(`${output}/face-fit-summary.json`, JSON.stringify({
    test: "sample photo face fit on generic male and female avatar bodies",
    results,
    facePipelineUsed: "home-screen Try the sample portrait",
    pageErrors: errors,
    verdict: "Screenshots require visual inspection to determine whether the face is seated or floating."
  }, null, 2));
  assert.deepEqual(errors, [], "Browser should not report uncaught page errors");
  assert.equal(results.length, 2);
  assert.ok(results.every((item) => item.canvasVisible), "Viewer canvas should be visible for both body fits");
  console.log("PASS: sample portrait applied; screenshots captured for both generic body fits.");
} finally {
  await browser.close();
}
