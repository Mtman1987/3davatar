#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serviceDir = join(root, "face-reconstruction-service");
const port = process.env.FACE_RECONSTRUCTION_PORT || "8001";
const base = "http://127.0.0.1:" + port;

function findPython() {
  if (process.env.FACE_PYTHON_BIN) return process.env.FACE_PYTHON_BIN;
  const candidates = process.platform === "win32"
    ? [join(root, ".venv", "Scripts", "python.exe"), join(root, "..", "Humanoid-Face-3D", ".venv", "Scripts", "python.exe")]
    : [join(root, ".venv", "bin", "python"), join(root, "..", "Humanoid-Face-3D", ".venv", "bin", "python")];
  return candidates.find((candidate) => existsSync(candidate)) || (process.platform === "win32" ? "python" : "python3");
}

const python = findPython();
const token = process.env.FACE_RECONSTRUCTION_TOKEN || randomBytes(32).toString("hex");
const env = {
  ...process.env,
  FACE_PYTHON_BIN: python,
  FACE_RECONSTRUCTION_URL: base,
  FACE_RECONSTRUCTION_TOKEN: token,
  FACE_PIPELINE_ROOT: process.env.FACE_PIPELINE_ROOT || root,
  FACE_MODEL_DIR: process.env.FACE_MODEL_DIR || join(root, "data", "flame_model"),
  FACE_WORK_ROOT: process.env.FACE_WORK_ROOT || join(root, ".local", "face-reconstruction-jobs"),
  FACE_RECONSTRUCTION_SKIP_CLAY: "1",
};

let service;
let vite;
let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  if (vite && !vite.killed) vite.kill(signal);
  if (service && !service.killed) service.kill(signal);
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => stop(signal));

function watch(child, label) {
  return new Promise((done) => {
    child.once("exit", (code, signal) => {
      if (!stopping) {
        console.error("[AvatarAce] " + label + " exited (code=" + code + ", signal=" + signal + ").");
        process.exitCode = code ?? 1;
        stop();
      }
      done();
    });
    child.once("error", (error) => {
      console.error("[AvatarAce] Could not start " + label + ": " + error.message);
      process.exitCode = 1;
      stop();
      done();
    });
  });
}

async function waitForService() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && !stopping && service.exitCode === null) {
    try {
      const response = await fetch(base + "/health", { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const health = await response.json();
        console.log("[AvatarAce] Local face pipeline API ready at " + base);
        if (!health.pipeline_available) console.warn("[AvatarAce] Pipeline runner missing under " + env.FACE_PIPELINE_ROOT);
        if (health.missing_models?.length) console.warn("[AvatarAce] Required model assets missing: " + health.missing_models.join(", "));
        return true;
      }
    } catch {}
    await new Promise((done) => setTimeout(done, 500));
  }
  if (!stopping) {
    console.error("[AvatarAce] Python service did not become ready; see the Python error above.");
    process.exitCode = 1;
    stop();
  }
  return false;
}

async function main() {
  if (!existsSync(join(serviceDir, "app.py"))) throw new Error("Missing face-reconstruction-service/app.py.");
  service = spawn(python, ["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", port], {
    cwd: serviceDir, env, stdio: "inherit",
  });
  const serviceExit = watch(service, "Python face service");
  if (!await waitForService()) {
    await serviceExit;
    return;
  }
  console.log("[AvatarAce] Starting Vite on http://localhost:8080");
  vite = spawn(process.execPath, [join(root, "scripts", "with-app-env.mjs"), "vite", "dev", "--host", "0.0.0.0", "--port", "8080"], {
    cwd: root, env, stdio: "inherit",
  });
  const viteExit = watch(vite, "Vite");
  await Promise.race([serviceExit, viteExit]);
}

main().catch((error) => {
  console.error("[AvatarAce] Local development startup failed:", error.message || error);
  process.exitCode = 1;
  stop();
});
