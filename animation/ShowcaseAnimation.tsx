"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import TradingHome from "../app/page";
import styles from "./showcase.module.css";

type TourStep = {
  label: string;
  selector: string;
  text?: string;
  index?: number;
  waitBefore?: number;
  waitAfter?: number;
  zoom?: number;
  followCursor?: boolean;
};

type CursorState = {
  x: number;
  y: number;
  clicking: boolean;
  visible: boolean;
};

type CameraState = {
  x: number;
  y: number;
  scale: number;
};

type IntroPhase = "search" | "results" | "loading";

type ClickOptions = {
  zoom?: number;
  followCursor?: boolean;
  skipScroll?: boolean;
};

const sleep = (ms: number) => {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const isElementUsable = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();

  if (rect.width < 2 || rect.height < 2) {
    return false;
  }

  const style = window.getComputedStyle(element);

  if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") {
    return false;
  }

  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
};

const findTarget = (
  root: HTMLElement,
  step: Pick<TourStep, "selector" | "text" | "index">
): HTMLElement | null => {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(step.selector));

  if (nodes.length === 0) {
    return null;
  }

  const wantedText = step.text?.toLowerCase().trim();

  const match = nodes.find((node) => {
    if (!isElementUsable(node)) {
      return false;
    }

    if (!wantedText) {
      return true;
    }

    const text = node.textContent?.toLowerCase() ?? "";

    return text.includes(wantedText);
  });

  if (!wantedText) {
    const usableNodes = nodes.filter((node) => isElementUsable(node));

    if (usableNodes.length === 0) {
      return null;
    }

    if (typeof step.index === "number") {
      return usableNodes[step.index] ?? null;
    }

    return usableNodes[0] ?? null;
  }

  if (!match) {
    return null;
  }

  if (typeof step.index === "number") {
    const matches = nodes.filter((node) => {
      if (!isElementUsable(node)) {
        return false;
      }

      const text = node.textContent?.toLowerCase() ?? "";
      return text.includes(wantedText);
    });

    return matches[step.index] ?? null;
  }

  return match;
};

export default function ShowcaseAnimation() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const introSearchRef = useRef<HTMLButtonElement | null>(null);
  const introResultRef = useRef<HTMLButtonElement | null>(null);
  const [featureTitle, setFeatureTitle] = useState("Loading showcase");
  const [status, setStatus] = useState("Booting workspace...");
  const [introVisible, setIntroVisible] = useState(true);
  const [introPhase, setIntroPhase] = useState<IntroPhase>("search");
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, scale: 1 });
  const [followCursor, setFollowCursor] = useState(false);
  const [viewport, setViewport] = useState({ width: 1280, height: 720 });
  const [cursor, setCursor] = useState<CursorState>({
    x: 120,
    y: 120,
    clicking: false,
    visible: false
  });

  const followOffset = useMemo(() => {
    if (!followCursor) {
      return { x: 0, y: 0 };
    }

    return {
      x: (viewport.width / 2 - cursor.x) * 0.06,
      y: (viewport.height / 2 - cursor.y) * 0.06
    };
  }, [cursor.x, cursor.y, followCursor, viewport.height, viewport.width]);

  useEffect(() => {
    const syncViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);

    return () => {
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const neutralCamera: CameraState = { x: 0, y: 0, scale: 1 };

    const setCameraToTarget = async (target: HTMLElement, zoom = 1.18, follow = false) => {
      const host = hostRef.current;
      if (!host || cancelled) {
        return;
      }

      const hostRect = host.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const centerX = targetRect.left - hostRect.left + targetRect.width / 2;
      const centerY = targetRect.top - hostRect.top + targetRect.height / 2;

      const minX = hostRect.width - hostRect.width * zoom;
      const minY = hostRect.height - hostRect.height * zoom;

      const nextCamera: CameraState = {
        scale: zoom,
        x: clamp(hostRect.width / 2 - centerX * zoom, minX, 0),
        y: clamp(hostRect.height / 2 - centerY * zoom, minY, 0)
      };

      setCamera(nextCamera);
      setFollowCursor(follow);
      await sleep(320);
    };

    const resetCamera = async (wait = 240) => {
      if (cancelled) {
        return;
      }

      setFollowCursor(false);
      setCamera(neutralCamera);
      await sleep(wait);
    };

    const performClick = async (target: HTMLElement, options: ClickOptions = {}) => {
      if (cancelled) {
        return;
      }

      if (!options.skipScroll) {
        target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        await sleep(220);
      }

      if (typeof options.zoom === "number") {
        await setCameraToTarget(target, options.zoom, options.followCursor ?? false);
      } else if (options.followCursor) {
        setFollowCursor(true);
      }

      if (cancelled) {
        return;
      }

      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      setCursor((prev) => ({ ...prev, x, y, clicking: false, visible: true }));
      await sleep(320);

      if (cancelled) {
        return;
      }

      setCursor((prev) => ({ ...prev, clicking: true }));
      await sleep(100);

      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      target.click();
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

      await sleep(130);
      setCursor((prev) => ({ ...prev, clicking: false }));
    };

    const runStep = async (step: TourStep) => {
      if (cancelled) {
        return false;
      }

      if (step.waitBefore) {
        await sleep(step.waitBefore);
      }

      setStatus(step.label);
      await resetCamera(180);

      let target: HTMLElement | null = null;

      for (let i = 0; i < 14; i += 1) {
        if (cancelled) {
          return false;
        }

        const host = hostRef.current;
        if (!host) {
          await sleep(220);
          continue;
        }

        target = findTarget(host, step);

        if (target) {
          break;
        }

        setStatus(`Waiting for ${step.label.toLowerCase()}...`);
        await sleep(220);
      }

      if (!target) {
        return false;
      }

      await performClick(target, { zoom: step.zoom, followCursor: step.followCursor });

      if (step.waitAfter) {
        await sleep(step.waitAfter);
      } else {
        await sleep(720);
      }

      return true;
    };

    const focusSelector = async (
      label: string,
      selector: string,
      zoom = 1.1,
      follow = false,
      holdMs = 900
    ) => {
      if (cancelled) {
        return;
      }

      setStatus(label);
      const host = hostRef.current;

      if (!host) {
        return;
      }

      const target = host.querySelector<HTMLElement>(selector);

      if (!target) {
        return;
      }

      await resetCamera(150);
      await setCameraToTarget(target, zoom, follow);
      await sleep(holdMs);
    };

    const scrollWatchlist = async () => {
      const host = hostRef.current;
      if (!host || cancelled) {
        return;
      }

      const list = host.querySelector<HTMLElement>(".watchlist-body");

      if (!list) {
        return;
      }

      await setCameraToTarget(list, 1.28, true);
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      await sleep(900);
      list.scrollTo({ top: 0, behavior: "smooth" });
      await sleep(680);
    };

    const runTour = async () => {
      await sleep(880);
      if (cancelled) {
        return;
      }

      setCursor((prev) => ({ ...prev, visible: true }));

      setFeatureTitle("Google to yazan.trade");
      setStatus("Searching Google for yazan.trade");
      setIntroVisible(true);
      setIntroPhase("search");
      await sleep(320);

      const searchButton = introSearchRef.current;
      if (searchButton) {
        await performClick(searchButton, { zoom: 1.06, followCursor: true, skipScroll: true });
      }

      if (cancelled) {
        return;
      }

      setIntroPhase("results");
      await sleep(440);

      const resultButton = introResultRef.current;
      if (resultButton) {
        await performClick(resultButton, { zoom: 1.06, followCursor: true, skipScroll: true });
      }

      if (cancelled) {
        return;
      }

      setIntroPhase("loading");
      setStatus("Opening yazan.trade");
      await sleep(900);
      setIntroVisible(false);
      await resetCamera(360);

      setFeatureTitle("Assets to choose from");
      await runStep({
        label: "Opening Assets tab",
        selector: "button[title='Assets']",
        zoom: 1.2,
        followCursor: true,
        waitAfter: 640
      });
      await runStep({
        label: "Comparing BTC and ETH",
        selector: "button.watchlist-row",
        text: "ETHUSDT.P",
        zoom: 1.34,
        followCursor: true,
        waitAfter: 620
      });
      await runStep({
        label: "Switching to SOL",
        selector: "button.watchlist-row",
        text: "SOLUSDT.P",
        zoom: 1.34,
        followCursor: true,
        waitAfter: 620
      });
      setStatus("Showing the full asset list");
      await scrollWatchlist();

      setFeatureTitle("People and models");
      await runStep({
        label: "Opening Models / People tab",
        selector: "button[title='Models']",
        zoom: 1.2,
        followCursor: true,
        waitAfter: 640
      });
      await runStep({
        label: "Selecting Yazan",
        selector: "button.model-row",
        text: "Yazan",
        zoom: 1.36,
        followCursor: true,
        waitAfter: 620
      });
      await runStep({
        label: "Selecting ICT model",
        selector: "button.model-row",
        text: "ICT",
        zoom: 1.36,
        followCursor: true,
        waitAfter: 620
      });
      await runStep({
        label: "Selecting Lyra model",
        selector: "button.model-row",
        text: "Lyra",
        zoom: 1.36,
        followCursor: true,
        waitAfter: 760
      });

      setFeatureTitle("History and visualizations");
      await runStep({
        label: "Opening History tab",
        selector: "button[title='History']",
        zoom: 1.2,
        followCursor: true,
        waitAfter: 640
      });
      await runStep({
        label: "Showing all history trades on chart",
        selector: "button.panel-action-btn",
        text: "Show All On Chart",
        zoom: 1.3,
        followCursor: true,
        waitAfter: 900
      });
      await focusSelector("Viewing all trade visualizations", ".chart-stage", 1.1, false, 920);
      await runStep({
        label: "Opening history trade #1",
        selector: "button.history-row",
        index: 0,
        zoom: 1.36,
        followCursor: true,
        waitAfter: 640
      });
      await focusSelector("Viewing selected trade visualization #1", ".chart-stage", 1.12, true, 860);
      await runStep({
        label: "Opening history trade #2",
        selector: "button.history-row",
        index: 1,
        zoom: 1.36,
        followCursor: true,
        waitAfter: 640
      });
      await focusSelector("Viewing selected trade visualization #2", ".chart-stage", 1.12, true, 940);

      setFeatureTitle("Action tab and notifications");
      await runStep({
        label: "Opening Action tab",
        selector: "button[title='Action']",
        zoom: 1.2,
        followCursor: true,
        waitAfter: 640
      });
      await runStep({
        label: "Inspecting an action event",
        selector: "button.history-row",
        index: 0,
        zoom: 1.36,
        followCursor: true,
        waitAfter: 760
      });
      await runStep({
        label: "Opening top-right notifications",
        selector: "button.notif-btn",
        zoom: 1.3,
        followCursor: true,
        waitAfter: 980
      });
      await runStep({
        label: "Closing notifications",
        selector: "button.notif-btn",
        zoom: 1.3,
        followCursor: true,
        waitAfter: 760
      });

      setFeatureTitle("Showcase complete");
      setStatus("Each feature was shown once.");
      await resetCamera(260);
    };

    runTour();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className={styles.stage}>
      <div className={styles.frame} ref={hostRef}>
        <motion.div
          className={styles.cameraSurface}
          animate={{
            x: camera.x + followOffset.x,
            y: camera.y + followOffset.y,
            scale: camera.scale
          }}
          transition={{ type: "spring", stiffness: 160, damping: 24, mass: 0.7 }}
        >
          <TradingHome />
        </motion.div>
      </div>

      <div className={styles.hud}>
        <strong>{featureTitle}</strong>
        <span>{status}</span>
      </div>

      {introVisible ? (
        <motion.div
          className={styles.browserOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <div className={styles.browserChrome}>
            <div className={styles.browserDots}>
              <span />
              <span />
              <span />
            </div>
            <div className={styles.addressBar}>
              {introPhase === "search" ? "google.com" : "yazan.trade"}
            </div>
          </div>

          {introPhase === "search" ? (
            <div className={styles.googlePane}>
              <h2>Google</h2>
              <p>yazan.trade</p>
              <button ref={introSearchRef} type="button" className={styles.googleAction}>
                Search
              </button>
            </div>
          ) : null}

          {introPhase === "results" ? (
            <div className={styles.resultsPane}>
              <span className={styles.resultTag}>Top Result</span>
              <button ref={introResultRef} type="button" className={styles.resultLink}>
                yazan.trade - Trading Workspace
              </button>
              <p>Open live assets, copy people/models, and view history overlays.</p>
            </div>
          ) : null}

          {introPhase === "loading" ? (
            <div className={styles.loadingPane}>Opening yazan.trade...</div>
          ) : null}
        </motion.div>
      ) : null}

      <motion.div
        className={styles.cursor}
        animate={{
          x: cursor.x,
          y: cursor.y,
          scale: cursor.clicking ? 0.9 : 1,
          opacity: cursor.visible ? 1 : 0
        }}
        transition={{ type: "spring", stiffness: 360, damping: 28, mass: 0.35 }}
      >
        <svg viewBox="0 0 20 20" aria-hidden>
          <path d="M3 2l11.5 10.8-5.2.7-2.2 4.4L3 2z" fill="currentColor" />
        </svg>
        {cursor.clicking ? (
          <motion.span
            className={styles.cursorRing}
            initial={{ opacity: 0.62, scale: 0.24 }}
            animate={{ opacity: 0, scale: 1.75 }}
            transition={{ duration: 0.26, ease: "easeOut" }}
          />
        ) : null}
      </motion.div>
    </section>
  );
}
