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
  calloutFocus?: string;
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
  targetLeft: number;
  targetTop: number;
  targetRight: number;
  targetBottom: number;
  focusLabel?: string;
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
  calloutFocus?: string;
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
    scale: 0.97,
    y: 16,
    rotateX: 1.6,
    rotateY: -1.6
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
      x: (viewport.width / 2 - cursor.x) * 0.018,
      y: (viewport.height / 2 - cursor.y) * 0.018
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
      side: CalloutSide = "right",
      focusLabel?: string
    ) => {
      if (!title || !detail) {
        return;
      }

      const innerWidth = window.innerWidth;
      const innerHeight = window.innerHeight;
      const cardWidth = innerWidth < 760 ? 244 : 360;
      const cardHeight = innerWidth < 760 ? 128 : 152;
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
        targetY: rect.top + rect.height / 2,
        targetLeft: rect.left,
        targetTop: rect.top,
        targetRight: rect.right,
        targetBottom: rect.bottom,
        focusLabel
      });
      setHighlightRect({
        x: rect.left - 6,
        y: rect.top - 6,
        width: rect.width + 12,
        height: rect.height + 12
      });
    };

    const setCameraToTarget = async (target: HTMLElement, zoom = 1.14, follow = false) => {
      const host = hostRef.current;
      if (!host || cancelled) {
        return;
      }

      const safeZoom = clamp(zoom, 1, 1.18);
      const hostRect = host.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const centerX = targetRect.left - hostRect.left + targetRect.width / 2;
      const centerY = targetRect.top - hostRect.top + targetRect.height / 2;

      const minX = hostRect.width - hostRect.width * safeZoom;
      const minY = hostRect.height - hostRect.height * safeZoom;

      const nextCamera: CameraState = {
        scale: safeZoom,
        x: clamp(hostRect.width / 2 - centerX * safeZoom, minX, 0),
        y: clamp(hostRect.height / 2 - centerY * safeZoom, minY, 0)
      };

      setCamera(nextCamera);
      setFollowCursor(follow);
      await sleep(520);
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
        options.calloutSide ?? "right",
        options.calloutFocus
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
        calloutSide: step.calloutSide,
        calloutFocus: step.calloutFocus
      });

      if (step.waitAfter) {
        await sleep(step.waitAfter);
      } else {
        await sleep(980);
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
        focus?: string;
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

      await resetCamera(220);
      await setCameraToTarget(target, zoom, follow);
      if (annotation) {
        const rect = target.getBoundingClientRect();
        showAnnotation(
          rect,
          annotation.title,
          annotation.detail,
          annotation.side ?? "right",
          annotation.focus
        );
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

      await setCameraToTarget(list, 1.12, false);
      const rect = list.getBoundingClientRect();
      showAnnotation(
        rect,
        "Large Asset Coverage",
        "The watchlist can be scanned quickly without leaving the chart.",
        "left",
        "Scrollable Asset List"
      );
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      await sleep(1300);
      list.scrollTo({ top: 0, behavior: "smooth" });
      await sleep(1200);
    };

    const setScene = (
      index: number,
      title: string,
      subtitle: string,
      rigOverride?: Partial<RigState>
    ) => {
      const presets: Record<number, RigState> = {
        1: { scale: 0.97, y: 16, rotateX: 1.6, rotateY: -1.6 },
        2: { scale: 0.975, y: 14, rotateX: 1.2, rotateY: -1.2 },
        3: { scale: 0.978, y: 12, rotateX: 1.1, rotateY: -0.9 },
        4: { scale: 0.98, y: 11, rotateX: 0.9, rotateY: -0.6 },
        5: { scale: 0.982, y: 10, rotateX: 0.7, rotateY: -0.4 }
      };

      setSceneNumber(index);
      setFeatureTitle(title);
      setStatus(subtitle);
      setProgress((index - 1) / totalScenes);
      setRig({ ...presets[index], ...rigOverride });
    };

    const runTour = async () => {
      await sleep(900);
      if (cancelled) {
        return;
      }

      setCursor((prev) => ({ ...prev, visible: true }));
      await resetCamera(260);

      setScene(
        1,
        "Step 1 · From Google to yazan.trade",
        "A familiar discovery path: search, open the result, and land on the platform."
      );
      setIntroVisible(true);
      setIntroPhase("search");
      setCallout({
        x: 18,
        y: 86,
        side: "bottom",
        title: "Discovery Flow",
        detail: "This intro simulates how a new user finds the platform.",
        targetX: Math.min(window.innerWidth * 0.5, 520),
        targetY: Math.min(window.innerHeight * 0.28, 260),
        targetLeft: Math.min(window.innerWidth * 0.5, 520) - 40,
        targetTop: Math.min(window.innerHeight * 0.28, 260) - 16,
        targetRight: Math.min(window.innerWidth * 0.5, 520) + 40,
        targetBottom: Math.min(window.innerHeight * 0.28, 260) + 16,
        focusLabel: "Entry Journey"
      });
      await sleep(620);

      const searchButton = introSearchRef.current;
      if (searchButton) {
        await performClick(searchButton, {
          zoom: 1.02,
          followCursor: false,
          skipScroll: true,
          calloutTitle: "Search Query",
          calloutDetail: "Entering the brand query starts the journey.",
          calloutSide: "bottom",
          calloutFocus: "google.com"
        });
      }

      if (cancelled) {
        return;
      }

      setIntroPhase("results");
      setStatus("Step 1 of 5 · Open the top result.");
      await sleep(760);

      const resultButton = introResultRef.current;
      if (resultButton) {
        await performClick(resultButton, {
          zoom: 1.02,
          followCursor: false,
          skipScroll: true,
          calloutTitle: "Direct Navigation",
          calloutDetail: "One click takes the user into the trading environment.",
          calloutSide: "bottom",
          calloutFocus: "yazan.trade"
        });
      }

      if (cancelled) {
        return;
      }

      setIntroPhase("loading");
      setStatus("Step 1 of 5 · Launching yazan.trade");
      await sleep(1200);
      setIntroVisible(false);
      await resetCamera(420);
      setProgress(1 / totalScenes);

      await resetCamera(260);
      setScene(
        2,
        "Step 2 · Explore Assets",
        "Show the breadth of contracts and how quickly symbols can be switched."
      );
      await runStep({
        label: "Opening Assets tab",
        selector: "button[title='Assets']",
        zoom: 1.1,
        followCursor: false,
        waitAfter: 980,
        calloutTitle: "Assets Panel",
        calloutDetail: "Contracts are grouped in one side panel for quick access.",
        calloutSide: "left",
        calloutFocus: "Assets Tab"
      });
      await runStep({
        label: "Switching to ETH",
        selector: "button.watchlist-row",
        text: "ETHUSDT.P",
        zoom: 1.14,
        followCursor: false,
        waitAfter: 1100,
        calloutTitle: "Instant Symbol Change",
        calloutDetail: "Switching assets keeps chart context intact and immediate.",
        calloutSide: "left",
        calloutFocus: "ETH Contract"
      });
      await scrollWatchlist();
      setStatus("Step 2 of 5 · Multiple markets, one clean flow.");
      setProgress(2 / totalScenes);

      await resetCamera(280);
      setScene(
        3,
        "Step 3 · Select People / Models",
        "Explain exactly who the user is copying from before showing performance."
      );
      await runStep({
        label: "Opening Models / People tab",
        selector: "button[title='Models']",
        zoom: 1.1,
        followCursor: false,
        waitAfter: 980,
        calloutTitle: "Models / People",
        calloutDetail: "Each profile is clearly labeled as Person or Model.",
        calloutSide: "left",
        calloutFocus: "Models / People"
      });
      await runStep({
        label: "Selecting Yazan",
        selector: "button.model-row",
        text: "Yazan",
        zoom: 1.14,
        followCursor: false,
        waitAfter: 1100,
        calloutTitle: "Person Example",
        calloutDetail: "Yazan appears as a Person with a dedicated account number.",
        calloutSide: "left",
        calloutFocus: "Yazan (Person)"
      });
      await runStep({
        label: "Selecting Lyra model",
        selector: "button.model-row",
        text: "Lyra",
        zoom: 1.14,
        followCursor: false,
        waitAfter: 1200,
        calloutTitle: "Model Example",
        calloutDetail: "Model profiles are separate, so source type is always transparent.",
        calloutSide: "left",
        calloutFocus: "Lyra (Model)"
      });
      setStatus("Step 3 of 5 · Profile choice drives history, actions, and notifications.");
      setProgress(3 / totalScenes);

      await resetCamera(280);
      setScene(
        4,
        "Step 4 · Review Trade History",
        "Show the timeline list and chart visualization together for faster review."
      );
      await runStep({
        label: "Opening History tab",
        selector: "button[title='History']",
        zoom: 1.1,
        followCursor: false,
        waitAfter: 980,
        calloutTitle: "History Timeline",
        calloutDetail: "Closed trades are listed in a clean chronological view.",
        calloutSide: "left",
        calloutFocus: "History Tab"
      });
      await runStep({
        label: "Showing all history trades on chart",
        selector: "button.panel-action-btn",
        text: "Show All On Chart",
        zoom: 1.14,
        followCursor: false,
        waitAfter: 1200,
        calloutTitle: "Chart Overlay",
        calloutDetail: "Historical entries, exits, TP, and SL are visualized on chart.",
        calloutSide: "left",
        calloutFocus: "Show All On Chart"
      });
      await focusSelector("Viewing all trade visualizations", ".chart-stage", 1.06, false, 1300, {
        title: "Visual Confirmation",
        detail: "Price structure and trade outcomes are readable in one place.",
        side: "top",
        focus: "Trade Overlay"
      });
      await runStep({
        label: "Opening one history trade",
        selector: "button.history-row",
        index: 0,
        zoom: 1.15,
        followCursor: false,
        waitAfter: 1100,
        calloutTitle: "Single Trade Drill-Down",
        calloutDetail: "Selecting one row isolates that trade for detailed inspection.",
        calloutSide: "left",
        calloutFocus: "History Trade #1"
      });
      await focusSelector(
        "Viewing selected trade visualization",
        ".chart-stage",
        1.07,
        false,
        1400,
        {
          title: "Focused View",
          detail: "Entry, TP, SL, and outcome stay visible without visual clutter.",
          side: "top",
          focus: "Selected Trade"
        }
      );
      setStatus("Step 4 of 5 · History explains performance clearly.");
      setProgress(4 / totalScenes);

      await resetCamera(280);
      setScene(
        5,
        "Step 5 · Actions and Notifications",
        "Finish with real-time operations: event log plus global alerts."
      );
      await runStep({
        label: "Opening Action tab",
        selector: "button[title='Action']",
        zoom: 1.1,
        followCursor: false,
        waitAfter: 980,
        calloutTitle: "Action Feed",
        calloutDetail: "Orders, TP/SL updates, and exits are centralized in one log.",
        calloutSide: "left",
        calloutFocus: "Action Tab"
      });
      await runStep({
        label: "Inspecting an action event",
        selector: "button.history-row",
        index: 0,
        zoom: 1.14,
        followCursor: false,
        waitAfter: 1100,
        calloutTitle: "Synced Detail",
        calloutDetail: "Choosing an action event immediately syncs chart context.",
        calloutSide: "left",
        calloutFocus: "Action Event"
      });
      await runStep({
        label: "Opening top-right notifications",
        selector: "button.notif-btn",
        zoom: 1.14,
        followCursor: false,
        waitAfter: 1200,
        calloutTitle: "Notifications",
        calloutDetail: "Global alerts keep account and trade state visible at all times.",
        calloutSide: "bottom",
        calloutFocus: "Notifications"
      });
      await focusSelector("Reviewing notifications", ".notif-popover", 1.12, false, 1350, {
        title: "Readable Alert Feed",
        detail: "The feed is concise, prioritized, and easy to scan quickly.",
        side: "bottom",
        focus: "Alert List"
      });

      setFeatureTitle("Clear Workflow. Calm Presentation.");
      setStatus("A linear showcase focused on clarity, not motion.");
      setProgress(1);
      await sleep(1100);
      await resetCamera(340);
      setCursor((prev) => ({ ...prev, visible: false }));
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

    const calloutWidth = viewport.width < 760 ? 244 : 360;
    const calloutHeight = viewport.width < 760 ? 128 : 152;
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

    const targetCenterX = (callout.targetLeft + callout.targetRight) / 2;
    const targetCenterY = (callout.targetTop + callout.targetBottom) / 2;
    const horizontalBias = Math.abs(targetCenterX - startX) >= Math.abs(targetCenterY - startY);
    let endX = targetCenterX;
    let endY = targetCenterY;

    if (horizontalBias) {
      endX = targetCenterX > startX ? callout.targetLeft : callout.targetRight;
    } else {
      endY = targetCenterY > startY ? callout.targetTop : callout.targetBottom;
    }

    const bend = Math.max(36, Math.min(180, Math.hypot(endX - startX, endY - startY) * 0.34));
    const control1X = horizontalBias ? startX + (endX > startX ? bend : -bend) : startX;
    const control1Y = horizontalBias ? startY : startY + (endY > startY ? bend : -bend);
    const control2X = horizontalBias ? endX - (endX > startX ? bend : -bend) : endX;
    const control2Y = horizontalBias ? endY : endY - (endY > startY ? bend : -bend);
    const labelX = clamp(endX + 10, 8, viewport.width - 132);
    const labelY = clamp(endY - 22, 8, viewport.height - 24);

    return {
      path: `M ${startX} ${startY} C ${control1X} ${control1Y} ${control2X} ${control2Y} ${endX} ${endY}`,
      targetX: endX,
      targetY: endY,
      labelX,
      labelY
    };
  }, [callout, viewport.height, viewport.width]);

  return (
    <section className={styles.stage}>
      <div className={styles.ambientLayer} aria-hidden>
        <motion.span
          className={`${styles.orb} ${styles.orbA}`}
          animate={{ x: [-10, 12, -8], y: [-5, 8, -5], scale: [1, 1.04, 1] }}
          transition={{ duration: 18, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
        />
        <motion.span
          className={`${styles.orb} ${styles.orbB}`}
          animate={{ x: [10, -12, 8], y: [6, -8, 4], scale: [1.02, 0.98, 1.02] }}
          transition={{ duration: 20, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
        />
        <motion.span
          className={`${styles.orb} ${styles.orbC}`}
          animate={{ x: [-8, 10, -8], y: [8, -6, 6], scale: [0.98, 1.03, 0.98] }}
          transition={{ duration: 22, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
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
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
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
                transition={{ duration: 0.76, ease: [0.22, 1, 0.36, 1] }}
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

      {callout?.focusLabel && connector ? (
        <motion.span
          className={styles.targetLabel}
          style={{ left: connector.labelX, top: connector.labelY }}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {callout.focusLabel}
        </motion.span>
      ) : null}

      {callout ? (
        <motion.aside
          className={`${styles.calloutCard} ${calloutSideClass}`}
          style={{ left: callout.x, top: callout.y }}
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          <div className={styles.calloutTagRow}>
            <span className={styles.calloutTag}>Now Showing</span>
            <span className={styles.calloutScene}>
              Scene {Math.max(1, sceneNumber)}/{totalScenes}
            </span>
          </div>
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
