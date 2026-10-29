import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";

// Run against the existing dev server; CHROME_PATH may point to installed Chrome.
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
fs.mkdirSync("evidence", { recursive: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(process.env.APP_URL || "http://127.0.0.1:8080/");
  // Wait for real hydration, not just SSR markup (an early click can be lost).
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent.includes("Try the sample") && Object.keys(b).some(k => k.startsWith("__reactProps"))));
  await page.getByRole("button", { name: "Try the sample portrait" }).click();
  await page.waitForSelector("[data-connected-face]", { timeout: 90000 });
  const capture = async name => { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await page.screenshot({ path: `evidence/${name}.png` }); };
  const report = async () => JSON.parse(await page.locator("[data-connected-face]").getAttribute("data-connected-face"));
  const rotate = async () => { const r = await page.locator("canvas").first().boundingBox(); await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+185,r.y+r.height/2,{steps:12});await page.mouse.up(); };
  for (const sex of ["male", "female"]) {
    if (sex === "female") {
      await page.getByRole("button", { name: "Body", exact: true }).click();
      await page.getByRole("button", { name: "Female Load the real female base GLB" }).click();
      await page.waitForFunction(async () => { const {useStudio}=await import("/src/lib/avatar/store.ts");return useStudio.getState().bodyAsset==="female"&&useStudio.getState().status==="ready"&&document.querySelector("[data-connected-face]"); });
      await page.getByRole("button", { name: "Face", exact: true }).click();
    }
    await capture(`${sex}-front`); const info = await report();assert.equal(info.morphNames.length,52);assert.ok(info.changedVertices>1000);
    await page.getByRole("button", { name: "Smile", exact: true }).click();await capture(`${sex}-smile`);
    await page.getByRole("button", { name: "Blink", exact: true }).click();await capture(`${sex}-blink`);
    await page.getByRole("button", { name: "Photo", exact: true }).click();await rotate();await capture(`${sex}-profile`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const downloadPromise = page.waitForEvent("download", {timeout:90000});await page.getByRole("button", {name:"Download GLB"}).click();const download=await downloadPromise;await download.saveAs(`evidence/${sex}-connected.glb`);
    await page.getByRole("button",{name:"Save on this phone"}).click();await page.getByText("Saved on this phone.",{exact:true}).waitFor();
    results.push({sex,...info,exportBytes:fs.statSync(`evidence/${sex}-connected.glb`).size,saved:true});
  }
  // A new generation restores the prior binding first; no old overlay survives.
  await page.getByRole("button",{name:"Face",exact:true}).click();await page.getByRole("button",{name:"Use the sample portrait"}).click();
  await page.waitForFunction(async()=>{const {useStudio}=await import("/src/lib/avatar/store.ts");return useStudio.getState().faceRev>=2&&document.querySelector("[data-connected-face]");});
  await page.setViewportSize({width:390,height:844});await capture("female-mobile");assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.reload();await page.waitForFunction(()=>[...document.querySelectorAll("button")].some(b=>b.textContent.includes("Saved")&&Object.keys(b).some(k=>k.startsWith("__reactProps"))));
  await page.getByRole("button",{name:"Saved",exact:true}).click();
  await page.locator("button").filter({hasText:/Female · Hoodie/}).first().click();await page.waitForSelector("[data-connected-face]",{timeout:90000});await capture("save-reopen-mobile");
  assert.deepEqual(errors,[]);fs.writeFileSync("evidence/browser-results.json",JSON.stringify({results,newPhotoRebound:true,saveReopen:true,mobileOverflow:false,pageErrors:errors},null,2));
  console.log(JSON.stringify(results,null,2));
} finally { await browser.close(); }