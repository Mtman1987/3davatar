import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const output = "test-results";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const errors = [];
  const network = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/virtual:tanstack|@vite|\.js(?:\?|$)|\.task(?:\?|$)|mediapipe/i.test(url)) network.push({ type: "request", url });
  });
  page.on("response", (response) => {
    const url = response.url();
    if (/virtual:tanstack|@vite|\.js(?:\?|$)|\.task(?:\?|$)|mediapipe/i.test(url)) network.push({ type: "response", status: response.status(), url });
  });
  page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push("console: " + message.text());
  });
  page.on("requestfailed", (request) => errors.push("requestfailed: " + request.url() + " — " + (request.failure()?.errorText ?? "unknown")));
  // Test-only query flag enters the actual sample-photo pipeline on app mount. No home-screen
  // button lookup or click is needed, so the test starts the useful work immediately.
  // Wait for response headers; TanStack Start may delay DOMContentLoaded in CI.
  // The explicit UI/canvas checks below verify that the app actually becomes usable.
  console.log("Opening viewer with cameraSmoke=1");
  await page.goto("http://127.0.0.1:8080/?cameraSmoke=1", { waitUntil: "commit", timeout: 10_000 });
  try {
    await page.getByRole("button", { name: "Face", exact: true }).waitFor({ state: "visible", timeout: 90_000 });
  } catch (error) {
    await page.screenshot({ path: `${output}/failure-initial-page.png`, fullPage: true }).catch(() => {});
    await writeFile(`${output}/failure-diagnostics.json`, JSON.stringify({
      url: page.url(),
      title: await page.title().catch(() => ""),
      bodyText: await page.locator("body").innerText().catch(() => ""),
      htmlStart: (await page.locator("html").innerHTML().catch(() => "")).slice(0, 12000),
      pageErrors: errors,
      network: network.slice(-100),
      failure: String(error)
    }, null, 2));
    throw error;
  }
  await page.waitForFunction(() => document.querySelector("canvas")?.getBoundingClientRect().width > 0, null, { timeout: 30_000 });
  // A visible canvas alone is not enough: don't screenshot until MediaPipe has
  // actually completed and enabled the face presets. This validates the real
  // photo pipeline instead of capturing an empty or still-loading viewer.
  try {
    await page.waitForFunction(() => {
      const standard = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim().startsWith("Standard"));
      return standard instanceof HTMLButtonElement && !standard.disabled;
    }, null, { timeout: 90_000 });
  } catch (error) {
    await page.screenshot({ path: `${output}/failure-face-pipeline.png`, fullPage: true }).catch(() => {});
    await writeFile(`${output}/face-pipeline-diagnostics.json`, JSON.stringify({
      url: page.url(),
      title: await page.title().catch(() => ""),
      bodyText: await page.locator("body").innerText().catch(() => ""),
      pageErrors: errors,
      network: network.slice(-150),
      failure: String(error)
    }, null, 2));
    throw error;
  }

  const results = [];
  for (const body of ["Male", "Female"]) {
    await page.getByRole("button", { name: "Body", exact: true }).click();
    await page.getByRole("button", { name: new RegExp("^" + body + "$") }).click();
    await page.getByRole("button", { name: "Face", exact: true }).click();
    // Wait for the actual GLB to finish loading (Viewport increments this
    // counter once for renderer boot and again after model load), rather than
    // relying on a fixed one-second delay that can capture an empty canvas.
    await page.waitForFunction(() => {
      const viewport = document.querySelector("[data-viewport-booted]");
      return Number(viewport?.getAttribute("data-viewport-booted") ?? 0) >= 2;
    }, null, { timeout: 45_000 });
    await page.waitForTimeout(250);
    const path = `${output}/sample-face-fit-${body.toLowerCase()}.png`;
    await page.screenshot({ path, fullPage: true });
    results.push({ body, screenshot: path, canvasVisible: await page.locator("canvas").first().isVisible() });
  }

  await writeFile(`${output}/face-fit-summary.json`, JSON.stringify({
    test: "sample photo face fit on generic male and female avatar bodies",
    results,
    facePipelineUsed: "cameraSmoke query auto-starts the same sample portrait pipeline",
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
