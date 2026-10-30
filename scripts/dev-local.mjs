#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serviceDir = join(root, "face-reconstruction-service");
const port = process.env.FACE_RECONSTRUCTION_PORT || "8001";
const base = "http://127.0.0.1:" + port;
const siblingPipeline = resolve(root, "..", "Humanoid-Face-3D");
const home = homedir();
const pipelineRoot = process.env.FACE_PIPELINE_ROOT ||
  (existsSync(join(siblingPipeline, "scripts", "run_pipeline.py")) ? siblingPipeline : root);

const isTermux = process.env.PREFIX?.includes("com.termux") === true;
const debianPython = join(home, "Humanoid-Face-3D", ".venv", "bin", "python");

function findPython() {
  if (process.env.FACE_PYTHON_BIN) return process.env.FACE_PYTHON_BIN;
  if (isTermux) {
    if (!existsSync(join(home, "Humanoid-Face-3D", ".venv", "pyvenv.cfg"))) {
      throw new Error("The existing Debian face-pipeline environment was not found at " + debianPython);
    }
    console.log("[AvatarAce] Using the existing Debian PRoot Python environment: " + debianPython);
    return debianPython;
  }
  const windows = process.platform === "win32";
  const bin = windows ? ["Scripts", "python.exe"] : ["bin", "python"];
  const candidates = [
    join(root, ".venv", ...bin),
    join(pipelineRoot, ".venv", ...bin),
    join(siblingPipeline, ".venv", ...bin),
    join(home, "Humanoid-Face-3D", ".venv", ...bin),
    join(home, "AvatarAce-main-verified", "mediapipe-face-pipeline", ".venv", ...bin),
    join(home, "AvatarAce-main-verified", ".venv", ...bin),
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);
  const existing = candidates.find((candidate) => existsSync(candidate));
  if (existing) {
    console.log("[AvatarAce] Reusing existing Python environment: " + existing);
    return existing;
  }
  if (process.env.PREFIX?.includes("com.termux")) {
    throw new Error(
      "No existing face-pipeline virtual environment found. Checked: " +
      candidates.join(", ") +
      ". Set FACE_PYTHON_BIN to the existing environment's Python executable. " +
      "Refusing to use Termux system Python or compile NumPy/MediaPipe."
    );
  }
  return windows ? "python" : "python3";
}

const modelDir = process.env.FACE_MODEL_DIR || join(pipelineRoot, "data", "flame_model");
const python = findPython();
const token = process.env.FACE_RECONSTRUCTION_TOKEN || randomBytes(32).toString("hex");
const env = {
  ...process.env,
  FACE_PYTHON_BIN: python,
  FACE_RECONSTRUCTION_URL: base,
  FACE_RECONSTRUCTION_TOKEN: token,
  FACE_PIPELINE_ROOT: pipelineRoot,
  FACE_MODEL_DIR: modelDir,
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

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

async function main() {
  if (!existsSync(join(serviceDir, "app.py"))) throw new Error("Missing face-reconstruction-service/app.py.");
  if (isTermux) {
    const forwarded = [
      "FACE_PYTHON_BIN", "FACE_RECONSTRUCTION_URL", "FACE_RECONSTRUCTION_TOKEN",
      "FACE_PIPELINE_ROOT", "FACE_MODEL_DIR", "FACE_WORK_ROOT",
      "FACE_RECONSTRUCTION_SKIP_CLAY",
    ].map((key) => key + "=" + shellQuote(env[key])).join(" ");
    const command = "cd " + shellQuote(serviceDir) + " && exec /usr/bin/env " +
      forwarded + " " + shellQuote(python) +
      " -m uvicorn app:app --host 127.0.0.1 --port " + shellQuote(port);
    service = spawn("proot-distro", ["login", "debian", "--", "/bin/bash", "-lc", command], {
      cwd: root, env, stdio: "inherit",
    });
  } else {
    service = spawn(python, ["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", port], {
      cwd: serviceDir, env, stdio: "inherit",
    });
  }
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
