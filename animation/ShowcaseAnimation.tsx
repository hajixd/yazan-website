"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import TradingHome from "../app/page";
import styles from "./showcase.module.css";

type TourStep = {
  label: string;
  selector: string;
  text?: string;
  waitBefore?: number;
  waitAfter?: number;
};

type CursorState = {
  x: number;
  y: number;
  clicking: boolean;
  visible: boolean;
};

const sleep = (ms: number) => {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
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

const findTarget = (root: HTMLElement, step: TourStep): HTMLElement | null => {
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

  return match ?? null;
};

export default function ShowcaseAnimation() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("Booting workspace...");
  const [cursor, setCursor] = useState<CursorState>({
    x: 120,
    y: 120,
    clicking: false,
    visible: false
  });

  const steps = useMemo<TourStep[]>(
    () => [
      { label: "Switch timeframe to 1H", selector: "button.timeframe", text: "1H", waitAfter: 760 },
      { label: "Return timeframe to 15m", selector: "button.timeframe", text: "15m", waitAfter: 760 },
      { label: "Open Assets panel", selector: "button[title='Assets']", waitAfter: 720 },
      { label: "Change asset to ETHUSDT.P", selector: "button.watchlist-row", text: "ETHUSDT.P", waitAfter: 860 },
      { label: "Open Models / People", selector: "button[title='Models']", waitAfter: 720 },
      { label: "Select ICT model", selector: "button.model-row", text: "ICT", waitAfter: 880 },
      { label: "Open History tab", selector: "button[title='History']", waitAfter: 720 },
      { label: "Show all trades on chart", selector: "button.panel-action-btn", text: "Show All On Chart", waitAfter: 980 },
      { label: "Focus a history trade", selector: "button.history-row", waitAfter: 880 },
      { label: "Open Active tab", selector: "button[title='Active']", waitAfter: 760 },
      { label: "Show active trade on chart", selector: "button.panel-action-btn", text: "Show On Chart", waitAfter: 980 },
      { label: "Open notifications", selector: "button.notif-btn", waitAfter: 860 },
      { label: "Close notifications", selector: "button.notif-btn", waitAfter: 760 },
      { label: "Open Action tab", selector: "button[title='Action']", waitAfter: 760 },
      { label: "Return to History", selector: "button[title='History']", waitAfter: 840 }
    ],
    []
  );

  useEffect(() => {
    let cancelled = false;

    const performClick = async (target: HTMLElement) => {
      target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      await sleep(220);

      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      setCursor((prev) => ({ ...prev, x, y, clicking: false, visible: true }));
      await sleep(320);

      setCursor((prev) => ({ ...prev, clicking: true }));
      await sleep(90);

      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      target.click();
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

      await sleep(130);
      setCursor((prev) => ({ ...prev, clicking: false }));
    };

    const runTour = async () => {
      await sleep(900);
      setCursor((prev) => ({ ...prev, visible: true }));

      while (!cancelled) {
        for (const step of steps) {
          if (cancelled) {
            return;
          }

          if (step.waitBefore) {
            await sleep(step.waitBefore);
          }

          setStatus(step.label);

          const host = hostRef.current;
          if (!host) {
            await sleep(300);
            continue;
          }

          const target = findTarget(host, step);

          if (!target) {
            setStatus(`Waiting for ${step.label.toLowerCase()}...`);
            await sleep(460);
            continue;
          }

          await performClick(target);
          await sleep(step.waitAfter ?? 760);
        }

        setStatus("Replay from start...");
        await sleep(1200);
      }
    };

    runTour();

    return () => {
      cancelled = true;
    };
  }, [steps]);

  return (
    <section className={styles.stage}>
      <div className={styles.frame} ref={hostRef}>
        <TradingHome />
      </div>

      <div className={styles.hud}>
        <strong>yazan.trade Guided Tour</strong>
        <span>{status}</span>
      </div>

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
