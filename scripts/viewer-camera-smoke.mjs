import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const output = "test-results";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /browse the studio first/i }).click();
  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(2500);
  const before = await canvas.screenshot();
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Viewer canvas missing");
    // Simulate the same two-pointer touch sequence the canvas handler receives.
    // Synthetic pointers are not OS pointers, so disable browser pointer capture.
    canvas.setPointerCapture = () => {};
    const send = (type, pointerId, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerId, pointerType: "touch", isPrimary: pointerId === 1,
      clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
    send("pointerdown", 1, 120, 360);
    send("pointerdown", 2, 250, 360);
    send("pointermove", 1, 120, 300);
    send("pointermove", 2, 250, 300);
    send("pointerup", 1, 120, 300);
    send("pointerup", 2, 250, 300);
  });
  await page.waitForTimeout(500);
  const after = await canvas.screenshot();
  await page.screenshot({ path: `${output}/viewer-studio.png`, fullPage: true });
  await canvas.screenshot({ path: `${output}/viewer-after-vertical-pan.png` });
  await writeFile(`${output}/camera-test-summary.json`, JSON.stringify({
    viewport: { width: 390, height: 844 },
    canvasVisible: await canvas.isVisible(),
    gestureHintVisible: await page.getByText(/1 finger: turn/i).isVisible().catch(() => false),
    beforeBytes: before.length,
    afterBytes: after.length,
    canvasChangedAfterVerticalPan: !before.equals(after),
    pageErrors: errors,
  }, null, 2));
  assert.notEqual(before.toString("base64"), after.toString("base64"), "Canvas screenshot should change after vertical two-finger pan");
  assert.deepEqual(errors, [], "Browser should not report uncaught page errors");
  console.log("PASS: viewer loaded and vertical two-finger pan changed rendered canvas.");
} finally {
  await browser.close();
}
