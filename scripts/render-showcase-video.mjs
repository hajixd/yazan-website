import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { chromium } from "playwright";

const rootDir = process.cwd();
const port = Number(process.env.SHOWCASE_PORT ?? 4173);
const width = Number(process.env.SHOWCASE_WIDTH ?? 1920);
const height = Number(process.env.SHOWCASE_HEIGHT ?? 1080);
const durationMs = Number(process.env.SHOWCASE_DURATION_MS ?? 56000);
const tempDir = `${rootDir}/.render/showcase`;
const outputDir = `${rootDir}/public/showcase`;
const outputWebm = `${outputDir}/showcase-pro.webm`;
const outputMp4 = `${outputDir}/showcase-pro.mp4`;
const baseUrl = `http://127.0.0.1:${port}`;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const waitForServer = async (url, timeoutMs = 120_000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });

      if (response.status < 500) {
        return;
      }
    } catch {
      // Server not up yet.
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
  }

  throw new Error(`Timed out waiting for ${url}`);
};

const devServer = spawn(
  npmCommand,
  ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    cwd: rootDir,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  }
);

devServer.stdout.on("data", (chunk) => {
  process.stdout.write(String(chunk));
});

devServer.stderr.on("data", (chunk) => {
  process.stderr.write(String(chunk));
});

const stopDevServer = async () => {
  if (devServer.exitCode !== null || devServer.killed) {
    return;
  }

  devServer.kill("SIGTERM");

  await new Promise((resolve) => {
    devServer.once("exit", () => resolve());
    setTimeout(resolve, 1_500);
  });
};

try {
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  console.log(`Waiting for dev server at ${baseUrl} ...`);
  await waitForServer(`${baseUrl}/animation/live`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: tempDir,
      size: { width, height }
    }
  });

  const page = await context.newPage();
  await page.goto(`${baseUrl}/animation/live`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1_600);
  const video = page.video();

  console.log(`Recording ${durationMs}ms showcase at ${width}x${height} ...`);
  await page.waitForTimeout(durationMs);

  await context.close();
  await browser.close();

  if (!video) {
    throw new Error("Playwright did not return a video handle.");
  }

  const sourceVideoPath = await video.path();
  await copyFile(sourceVideoPath, outputWebm);
  console.log(`Saved rendered showcase: ${outputWebm}`);

  const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

  if (hasFfmpeg) {
    const transcode = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        outputWebm,
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputMp4
      ],
      { stdio: "inherit" }
    );

    if (transcode.status === 0) {
      console.log(`Saved rendered showcase: ${outputMp4}`);
    } else {
      console.warn("ffmpeg conversion failed; keeping webm output only.");
    }
  } else {
    console.warn("ffmpeg not found; skipping mp4 conversion.");
  }

  await rm(tempDir, { recursive: true, force: true });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await stopDevServer();
}
