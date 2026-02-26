import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { chromium } from "playwright";

const rootDir = process.cwd();
const port = Number(process.env.SHOWCASE_PORT ?? 4173);
const captureWidth = Number(process.env.SHOWCASE_CAPTURE_WIDTH ?? 2560);
const captureHeight = Number(process.env.SHOWCASE_CAPTURE_HEIGHT ?? 1440);
const targetWidth = Number(process.env.SHOWCASE_TARGET_WIDTH ?? 1920);
const targetHeight = Number(process.env.SHOWCASE_TARGET_HEIGHT ?? 1080);
const fps = Number(process.env.SHOWCASE_FPS ?? 30);
const useInterpolation = process.env.SHOWCASE_INTERPOLATE === "1";
const mp4Crf = Number(process.env.SHOWCASE_MP4_CRF ?? 14);
const durationMs = Number(process.env.SHOWCASE_DURATION_MS ?? 56000);
const serverMode = process.env.SHOWCASE_SERVER_MODE ?? "start";
const tempDir = `${rootDir}/.render/showcase`;
const outputDir = `${rootDir}/public/showcase`;
const outputWebm = `${outputDir}/showcase-pro.webm`;
const outputMp4 = `${outputDir}/showcase-pro.mp4`;
const finalDir = `${rootDir}/Final`;
const finalMp4 = `${finalDir}/Final.mp4`;
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

if (serverMode !== "dev") {
  console.log("Building production app for deterministic capture...");
  const build = spawnSync(npmCommand, ["run", "build"], {
    cwd: rootDir,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "inherit"
  });

  if (build.status !== 0) {
    throw new Error("Production build failed.");
  }
}

const serverArgs =
  serverMode === "dev"
    ? ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)]
    : ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(port)];

const appServer = spawn(npmCommand, serverArgs, {
  cwd: rootDir,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"]
});

appServer.stdout.on("data", (chunk) => {
  process.stdout.write(String(chunk));
});

appServer.stderr.on("data", (chunk) => {
  process.stderr.write(String(chunk));
});

const stopAppServer = async () => {
  if (appServer.exitCode !== null || appServer.killed) {
    return;
  }

  appServer.kill("SIGTERM");

  await new Promise((resolve) => {
    appServer.once("exit", () => resolve());
    setTimeout(resolve, 1_500);
  });
};

try {
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  await mkdir(finalDir, { recursive: true });

  console.log(`Waiting for app server at ${baseUrl} ...`);
  await waitForServer(`${baseUrl}/animation/live`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding"
    ]
  });
  const context = await browser.newContext({
    viewport: { width: captureWidth, height: captureHeight },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: tempDir,
      size: { width: captureWidth, height: captureHeight }
    }
  });

  const page = await context.newPage();
  await page.goto(`${baseUrl}/animation/live`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1_600);
  const video = page.video();

  console.log(`Recording ${durationMs}ms showcase at ${captureWidth}x${captureHeight} ...`);
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
    const filters = [`scale=${targetWidth}:${targetHeight}:flags=lanczos`];

    if (useInterpolation) {
      filters.push(`minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`);
    } else {
      filters.push(`fps=${fps}`);
    }

    filters.push("format=yuv420p");
    const filterGraph = filters.join(",");

    const transcode = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        outputWebm,
        "-an",
        "-vf",
        filterGraph,
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        String(mp4Crf),
        "-r",
        String(fps),
        "-movflags",
        "+faststart",
        outputMp4
      ],
      { stdio: "inherit" }
    );

    if (transcode.status === 0) {
      console.log(`Saved rendered showcase: ${outputMp4}`);
      await copyFile(outputMp4, finalMp4);
      console.log(`Copied final export: ${finalMp4}`);
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
  await stopAppServer();
}
