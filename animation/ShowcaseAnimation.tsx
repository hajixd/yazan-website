"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import TradingTerminal from "../app/TradingTerminal";
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
  calloutTitle?: string;
  calloutDetail?: string;
  calloutSide?: CalloutSide;
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

type RigState = {
  scale: number;
  y: number;
  rotateX: number;
  rotateY: number;
};

type CalloutSide = "right" | "left" | "top" | "bottom";

type CalloutState = {
  x: number;
  y: number;
  side: CalloutSide;
  title: string;
  detail: string;
  targetX: number;
  targetY: number;
};

type HighlightRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type IntroPhase = "search" | "results" | "loading";

type ClickOptions = {
  zoom?: number;
  followCursor?: boolean;
  skipScroll?: boolean;
  calloutTitle?: string;
  calloutDetail?: string;
  calloutSide?: CalloutSide;
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
  const totalScenes = 5;
  const sceneDotItems = useMemo(() => Array.from({ length: totalScenes }, (_, i) => i + 1), []);
  const [featureTitle, setFeatureTitle] = useState("Loading showcase");
  const [sceneNumber, setSceneNumber] = useState(0);
  const [status, setStatus] = useState("Preparing cinematic showcase...");
  const [progress, setProgress] = useState(0);
  const [introVisible, setIntroVisible] = useState(true);
  const [introPhase, setIntroPhase] = useState<IntroPhase>("search");
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, scale: 1 });
  const [rig, setRig] = useState<RigState>({
    scale: 0.9,
    y: 32,
    rotateX: 7,
    rotateY: -8
  });
  const [followCursor, setFollowCursor] = useState(false);
  const [callout, setCallout] = useState<CalloutState | null>(null);
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);
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
    const clearAnnotations = () => {
      setCallout(null);
      setHighlightRect(null);
    };

    const showAnnotation = (
      rect: DOMRect,
      title?: string,
      detail?: string,
      side: CalloutSide = "right"
    ) => {
      if (!title || !detail) {
        return;
      }

      const innerWidth = window.innerWidth;
      const innerHeight = window.innerHeight;
      const cardWidth = innerWidth < 760 ? 220 : 290;
      const cardHeight = 112;
      const gap = 20;
      let x = rect.right + gap;
      let y = rect.top + rect.height / 2 - cardHeight / 2;

      if (side === "left") {
        x = rect.left - cardWidth - gap;
      } else if (side === "top") {
        x = rect.left + rect.width / 2 - cardWidth / 2;
        y = rect.top - cardHeight - gap;
      } else if (side === "bottom") {
        x = rect.left + rect.width / 2 - cardWidth / 2;
        y = rect.bottom + gap;
      }

      const maxX = Math.max(8, innerWidth - cardWidth - 8);
      const maxY = Math.max(8, innerHeight - cardHeight - 8);

      setCallout({
        x: clamp(x, 8, maxX),
        y: clamp(y, 8, maxY),
        side,
        title,
        detail,
        targetX: rect.left + rect.width / 2,
        targetY: rect.top + rect.height / 2
      });
      setHighlightRect({
        x: rect.left - 6,
        y: rect.top - 6,
        width: rect.width + 12,
        height: rect.height + 12
      });
    };

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
      clearAnnotations();
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
      showAnnotation(
        rect,
        options.calloutTitle,
        options.calloutDetail,
        options.calloutSide ?? "right"
      );
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

        await sleep(220);
      }

      if (!target) {
        return false;
      }

      await performClick(target, {
        zoom: step.zoom,
        followCursor: step.followCursor,
        calloutTitle: step.calloutTitle,
        calloutDetail: step.calloutDetail,
        calloutSide: step.calloutSide
      });

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
      holdMs = 900,
      annotation?: {
        title: string;
        detail: string;
        side?: CalloutSide;
      }
    ) => {
      if (cancelled) {
        return;
      }

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
      if (annotation) {
        const rect = target.getBoundingClientRect();
        showAnnotation(rect, annotation.title, annotation.detail, annotation.side ?? "right");
      }
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
      const rect = list.getBoundingClientRect();
      showAnnotation(
        rect,
        "Large Asset Coverage",
        "The watchlist scroll demonstrates broad market coverage in one workspace.",
        "left"
      );
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      await sleep(900);
      list.scrollTo({ top: 0, behavior: "smooth" });
      await sleep(680);
    };

    const setScene = (
      index: number,
      title: string,
      subtitle: string,
      rigOverride?: Partial<RigState>
    ) => {
      const presets: Record<number, RigState> = {
        1: { scale: 0.88, y: 40, rotateX: 8, rotateY: -9 },
        2: { scale: 0.93, y: 28, rotateX: 5, rotateY: -6 },
        3: { scale: 0.94, y: 24, rotateX: 4, rotateY: 6 },
        4: { scale: 0.96, y: 20, rotateX: 2, rotateY: -3 },
        5: { scale: 0.93, y: 26, rotateX: 5, rotateY: 7 }
      };

      setSceneNumber(index);
      setFeatureTitle(title);
      setStatus(subtitle);
      setProgress((index - 1) / totalScenes);
      setRig({ ...presets[index], ...rigOverride });
    };

    const runTour = async () => {
      await sleep(880);
      if (cancelled) {
        return;
      }

      setCursor((prev) => ({ ...prev, visible: true }));

      setScene(
        1,
        "From Search to Signal",
        "Discover yazan.trade and enter a fully loaded market workspace."
      );
      setIntroVisible(true);
      setIntroPhase("search");
      setCallout({
        x: 18,
        y: 86,
        side: "bottom",
        title: "First Impression",
        detail: "A familiar entry path makes onboarding immediate for new users.",
        targetX: Math.min(window.innerWidth * 0.5, 520),
        targetY: Math.min(window.innerHeight * 0.28, 260)
      });
      await sleep(320);

      const searchButton = introSearchRef.current;
      if (searchButton) {
        await performClick(searchButton, { zoom: 1.06, followCursor: true, skipScroll: true });
      }

      if (cancelled) {
        return;
      }

      setIntroPhase("results");
      setStatus("Top result. One click away.");
      await sleep(440);

      const resultButton = introResultRef.current;
      if (resultButton) {
        await performClick(resultButton, { zoom: 1.06, followCursor: true, skipScroll: true });
      }

      if (cancelled) {
        return;
      }

      setIntroPhase("loading");
      setStatus("Launching yazan.trade");
      await sleep(900);
      setIntroVisible(false);
      await resetCamera(360);
      setProgress(1 / totalScenes);

      setScene(
        2,
        "A Broad Asset Universe",
        "Move across major and fast-moving contracts without breaking context."
      );
      await runStep({
        label: "Opening Assets tab",
        selector: "button[title='Assets']",
        zoom: 1.2,
        followCursor: true,
        waitAfter: 640,
        calloutTitle: "Unified Watchlist",
        calloutDetail: "Asset discovery happens beside the chart, not in a separate flow.",
        calloutSide: "left"
      });
      await runStep({
        label: "Comparing BTC and ETH",
        selector: "button.watchlist-row",
        text: "ETHUSDT.P",
        zoom: 1.34,
        followCursor: true,
        waitAfter: 620,
        calloutTitle: "Instant Switch",
        calloutDetail: "Symbol transitions are immediate for uninterrupted analysis.",
        calloutSide: "left"
      });
      await runStep({
        label: "Switching to SOL",
        selector: "button.watchlist-row",
        text: "SOLUSDT.P",
        zoom: 1.34,
        followCursor: true,
        waitAfter: 620,
        calloutTitle: "Built for Variety",
        calloutDetail: "The same clean workflow scales from majors to high-beta markets.",
        calloutSide: "left"
      });
      await scrollWatchlist();
      setProgress(2 / totalScenes);

      setScene(
        3,
        "People. Models. One Control Surface.",
        "Select who to copy from with explicit profile context and instant updates."
      );
      await runStep({
        label: "Opening Models / People tab",
        selector: "button[title='Models']",
        zoom: 1.2,
        followCursor: true,
        waitAfter: 640,
        calloutTitle: "Profile Library",
        calloutDetail: "People and Models are separated clearly for transparent source selection.",
        calloutSide: "left"
      });
      await runStep({
        label: "Selecting Yazan",
        selector: "button.model-row",
        text: "Yazan",
        zoom: 1.36,
        followCursor: true,
        waitAfter: 620,
        calloutTitle: "Person Profile",
        calloutDetail: "Human-led copy source selection is explicit and easy to audit.",
        calloutSide: "left"
      });
      await runStep({
        label: "Selecting ICT model",
        selector: "button.model-row",
        text: "ICT",
        zoom: 1.36,
        followCursor: true,
        waitAfter: 620,
        calloutTitle: "Model Profile",
        calloutDetail: "Algorithmic profile selection is a single action across the workspace.",
        calloutSide: "left"
      });
      await runStep({
        label: "Selecting Lyra model",
        selector: "button.model-row",
        text: "Lyra",
        zoom: 1.36,
        followCursor: true,
        waitAfter: 760,
        calloutTitle: "Live Context Shift",
        calloutDetail: "History and action views follow profile changes instantly.",
        calloutSide: "left"
      });
      setProgress(3 / totalScenes);

      setScene(
        4,
        "Trade History, Cinematic Clarity",
        "Performance is visible as both a timeline and chart-native visual narrative."
      );
      await runStep({
        label: "Opening History tab",
        selector: "button[title='History']",
        zoom: 1.2,
        followCursor: true,
        waitAfter: 640,
        calloutTitle: "Outcome Timeline",
        calloutDetail: "Every trade result is centralized for quick performance review.",
        calloutSide: "left"
      });
      await runStep({
        label: "Showing all history trades on chart",
        selector: "button.panel-action-btn",
        text: "Show All On Chart",
        zoom: 1.3,
        followCursor: true,
        waitAfter: 900,
        calloutTitle: "Portfolio Overlay",
        calloutDetail: "Visualize all historical executions directly in chart space.",
        calloutSide: "left"
      });
      await focusSelector("Viewing all trade visualizations", ".chart-stage", 1.1, false, 920, {
        title: "Context-Rich Review",
        detail: "Execution overlays preserve market structure while revealing outcomes.",
        side: "top"
      });
      await runStep({
        label: "Opening history trade #1",
        selector: "button.history-row",
        index: 0,
        zoom: 1.36,
        followCursor: true,
        waitAfter: 640,
        calloutTitle: "Precision Drill-Down",
        calloutDetail: "Isolate single trades to inspect entry, TP, and risk boundaries.",
        calloutSide: "left"
      });
      await focusSelector(
        "Viewing selected trade visualization #1",
        ".chart-stage",
        1.12,
        true,
        860,
        {
          title: "Focused Execution",
          detail: "Selected trades update on-chart immediately for quality evaluation.",
          side: "top"
        }
      );
      await runStep({
        label: "Opening history trade #2",
        selector: "button.history-row",
        index: 1,
        zoom: 1.36,
        followCursor: true,
        waitAfter: 640,
        calloutTitle: "Consistency View",
        calloutDetail: "Rapid comparison reveals consistency across symbols and outcomes.",
        calloutSide: "left"
      });
      await focusSelector(
        "Viewing selected trade visualization #2",
        ".chart-stage",
        1.12,
        true,
        940,
        {
          title: "Narrative on Chart",
          detail: "Every execution remains grounded in surrounding market behavior.",
          side: "top"
        }
      );
      setProgress(4 / totalScenes);

      setScene(
        5,
        "Operational Control in Real Time",
        "Action logs and notifications surface what matters, when it matters."
      );
      await runStep({
        label: "Opening Action tab",
        selector: "button[title='Action']",
        zoom: 1.2,
        followCursor: true,
        waitAfter: 640,
        calloutTitle: "Action Stream",
        calloutDetail: "Entries, exits, and risk events flow in one operational log.",
        calloutSide: "left"
      });
      await runStep({
        label: "Inspecting an action event",
        selector: "button.history-row",
        index: 0,
        zoom: 1.36,
        followCursor: true,
        waitAfter: 760,
        calloutTitle: "Synchronized Detail",
        calloutDetail: "Selecting an action instantly syncs chart context and symbol focus.",
        calloutSide: "left"
      });
      await runStep({
        label: "Opening top-right notifications",
        selector: "button.notif-btn",
        zoom: 1.3,
        followCursor: true,
        waitAfter: 980,
        calloutTitle: "Live Alerts",
        calloutDetail: "Critical account and trade events surface at global scope instantly.",
        calloutSide: "bottom"
      });
      await runStep({
        label: "Closing notifications",
        selector: "button.notif-btn",
        zoom: 1.3,
        followCursor: true,
        waitAfter: 760,
        calloutTitle: "Quiet When You Need It",
        calloutDetail: "High-signal notifications are present when needed, invisible when not.",
        calloutSide: "bottom"
      });

      setFeatureTitle("Designed for Modern Trading Teams");
      setStatus("yazan.trade");
      setProgress(1);
      await resetCamera(260);
    };

    runTour();

    return () => {
      cancelled = true;
    };
  }, []);

  const calloutSideClass = callout
    ? {
        right: styles.calloutRight,
        left: styles.calloutLeft,
        top: styles.calloutTop,
        bottom: styles.calloutBottom
      }[callout.side]
    : "";

  const connector = useMemo(() => {
    if (!callout) {
      return null;
    }

    const calloutWidth = viewport.width < 760 ? 224 : 304;
    const calloutHeight = viewport.width < 760 ? 104 : 122;
    let startX = callout.x + calloutWidth / 2;
    let startY = callout.y + calloutHeight / 2;

    if (callout.side === "left") {
      startX = callout.x + calloutWidth;
    } else if (callout.side === "right") {
      startX = callout.x;
    } else if (callout.side === "top") {
      startY = callout.y + calloutHeight;
    } else {
      startY = callout.y;
    }

    const controlX = startX + (callout.targetX - startX) * 0.48;
    const controlY = startY + (callout.targetY - startY) * 0.12;

    return {
      path: `M ${startX} ${startY} Q ${controlX} ${controlY} ${callout.targetX} ${callout.targetY}`,
      targetX: callout.targetX,
      targetY: callout.targetY
    };
  }, [callout, viewport.width]);

  return (
    <section className={styles.stage}>
      <div className={styles.ambientLayer} aria-hidden>
        <motion.span
          className={`${styles.orb} ${styles.orbA}`}
          animate={{ x: [-20, 26, -12], y: [-8, 22, -10], scale: [1, 1.1, 1] }}
          transition={{ duration: 12, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
        />
        <motion.span
          className={`${styles.orb} ${styles.orbB}`}
          animate={{ x: [24, -28, 16], y: [10, -24, 6], scale: [1.05, 0.92, 1.05] }}
          transition={{ duration: 14, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
        />
        <motion.span
          className={`${styles.orb} ${styles.orbC}`}
          animate={{ x: [-16, 18, -14], y: [16, -14, 12], scale: [0.94, 1.06, 0.94] }}
          transition={{ duration: 11, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
        />
      </div>

      <motion.div
        className={styles.letterboxTop}
        initial={{ y: -60 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.8, ease: [0.2, 0.85, 0.15, 1] }}
      />
      <motion.div
        className={styles.letterboxBottom}
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.8, ease: [0.2, 0.85, 0.15, 1] }}
      />

      <div className={styles.frame}>
        <motion.div
          className={styles.deviceRig}
          animate={{
            scale: rig.scale,
            y: rig.y,
            rotateX: rig.rotateX,
            rotateY: rig.rotateY
          }}
          transition={{ type: "spring", stiffness: 110, damping: 20, mass: 0.9 }}
        >
          <div className={styles.deviceFrame}>
            <div className={styles.deviceNotch} />
            <div className={styles.screenMask} ref={hostRef}>
              <motion.div
                className={styles.cameraSurface}
                animate={{
                  x: camera.x + followOffset.x,
                  y: camera.y + followOffset.y,
                  scale: camera.scale
                }}
                transition={{ type: "spring", stiffness: 160, damping: 24, mass: 0.7 }}
              >
                <TradingTerminal showcaseMode />
              </motion.div>
            </div>
            <div className={styles.deviceReflection} />
          </div>
        </motion.div>
      </div>

      <div className={styles.heroPanel}>
        <span className={styles.heroKicker}>YAZAN.TRADE</span>
        <motion.h1
          key={featureTitle}
          initial={{ opacity: 0, y: 12, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.42, ease: "easeOut" }}
        >
          {featureTitle}
        </motion.h1>
        <motion.p
          key={status}
          className={styles.heroStatus}
          initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.46, ease: "easeOut" }}
        >
          {status}
        </motion.p>
        <div className={styles.progressTrack}>
          <motion.span
            className={styles.progressFill}
            animate={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            transition={{ type: "spring", stiffness: 180, damping: 24, mass: 0.7 }}
          />
        </div>
        <div className={styles.sceneDots}>
          {sceneDotItems.map((dot) => (
            <span
              key={dot}
              className={`${styles.sceneDot} ${dot <= sceneNumber ? styles.sceneDotActive : ""}`}
            />
          ))}
        </div>
      </div>

      {highlightRect ? (
        <motion.div
          className={styles.targetHighlight}
          style={{
            left: highlightRect.x,
            top: highlightRect.y,
            width: highlightRect.width,
            height: highlightRect.height
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        />
      ) : null}

      {connector ? (
        <svg className={styles.calloutConnector} aria-hidden>
          <defs>
            <marker
              id="calloutArrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L8,3 z" fill="rgba(170, 211, 255, 0.95)" />
            </marker>
          </defs>
          <path d={connector.path} className={styles.calloutConnectorPath} markerEnd="url(#calloutArrowhead)" />
          <circle cx={connector.targetX} cy={connector.targetY} r="3" className={styles.calloutTargetDot} />
        </svg>
      ) : null}

      {callout ? (
        <motion.aside
          className={`${styles.calloutCard} ${calloutSideClass}`}
          style={{ left: callout.x, top: callout.y }}
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          <span className={styles.calloutTag}>Now Showing</span>
          <strong>{callout.title}</strong>
          <p>{callout.detail}</p>
        </motion.aside>
      ) : null}

      {introVisible ? (
        <motion.div
          className={styles.browserOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <div className={styles.browserWindow}>
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
          </div>
        </motion.div>
      ) : null}
    </section>
  );
}
