"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import ShowcaseAnimation from "./ShowcaseAnimation";
import styles from "./showcasePlayback.module.css";

export default function ShowcasePlayback() {
  const [forceLiveMode, setForceLiveMode] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    const search = typeof window === "undefined" ? "" : window.location.search;
    setForceLiveMode(new URLSearchParams(search).get("live") === "1");
  }, []);

  if (forceLiveMode || videoError) {
    return <ShowcaseAnimation />;
  }

  return (
    <section className={styles.stage}>
      <motion.video
        className={styles.video}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        initial={{ opacity: 0, scale: 1.01 }}
        animate={{ opacity: videoReady ? 1 : 0.24, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        onCanPlay={() => setVideoReady(true)}
        onError={() => setVideoError(true)}
      >
        <source src="/showcase/showcase-pro.mp4" type="video/mp4" />
        <source src="/showcase/showcase-pro.webm" type="video/webm" />
      </motion.video>

      {!videoReady ? <span className={styles.status}>Loading rendered showcase...</span> : null}
    </section>
  );
}
