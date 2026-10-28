import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const output = "test-results";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:8080/", { waitUntil: "commit", timeout: 15_000 });

  // Use the app's real sample portrait and real face-fitting pipeline.
  await page.getByRole("button", { name: /browse the studio first/i }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: /browse the studio first/i }).click();
  await page.getByRole("button", { name: "Face", exact: true }).click();
  await page.getByRole("button", { name: /use the sample portrait/i }).click();

  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "Standard", exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await page.getByRole("button", { name: "Standard", exact: true }).waitFor({ state: "enabled", timeout: 60_000 });
  await page.waitForTimeout(2500);

  const results = [];
  for (const body of ["Male", "Female"]) {
    await page.getByRole("button", { name: body, exact: true }).click().catch(async () => {
      // Body panel is a separate tab; switch there and select the generic base body.
      await page.getByRole("button", { name: "Body", exact: true }).click();
      await page.getByRole("button", { name: body, exact: true }).click();
      await page.getByRole("button", { name: "Face", exact: true }).click();
    });
    await page.waitForTimeout(5000);
    const path = `${output}/sample-face-fit-${body.toLowerCase()}.png`;
    await page.screenshot({ path, fullPage: true });
    results.push({ body, screenshot: path, canvasVisible: await canvas.isVisible() });
  }

  await writeFile(`${output}/face-fit-summary.json`, JSON.stringify({
    test: "sample photo face fit on generic male and female avatar bodies",
    results,
    facePipelineUsed: "UI Use the sample portrait",
    pageErrors: errors,
    verdict: "Screenshots require visual inspection to determine whether the face is seated or floating.",
  }, null, 2));
  assert.deepEqual(errors, [], "Browser should not report uncaught page errors");
  assert.equal(results.length, 2);
  assert.ok(results.every((item) => item.canvasVisible), "Viewer canvas should be visible for both body fits");
  console.log("PASS: sample portrait was applied through the actual face pipeline; male/female fit screenshots captured for visual inspection.");
} finally {
  await browser.close();
}
