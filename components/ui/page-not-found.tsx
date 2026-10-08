"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, House } from "lucide-react";
import { useMotionActivity } from "./use-motion-activity";
import styles from "./page-not-found.module.css";

const figures = [
  { source: 1, top: "2%", duration: "1.5s", rotation: "-90deg" },
  { source: 2, top: "12%", duration: "3s", rotation: "-360deg" },
  { source: 3, top: "22%", duration: "5s", rotation: "-720deg" },
  { source: 1, top: "32%", duration: "2.5s", rotation: "-360deg" },
  { source: 1, top: "42%", duration: "2s", rotation: "-720deg" },
];

/** Shared browser-page 404 only; API failures and authorization are not redirected here. */
export default function NotFoundPage() {
  const router = useRouter();
  const scene = useRef<HTMLElement>(null);
  const active = useMotionActivity(scene);
  const goBack = () => {
    // A direct bookmark or external referral must always have a safe recovery.
    try {
      if (history.length > 1 && document.referrer
        && new URL(document.referrer).origin === location.origin) {
        router.back();
        return;
      }
    } catch { /* Missing/invalid history context uses the public home. */ }
    router.replace("/");
  };

  return (
    <main ref={scene} className={styles.scene} data-motion-active={active} aria-labelledby="missing-page-title">
      <CircleAnimation active={active} />
      <div className={styles.characters} aria-hidden="true">
        {figures.map((figure, index) => (
          <div key={index} className={styles.traveler} style={{
            top: figure.top, animationDuration: figure.duration,
            "--figure-rotation": figure.rotation,
          } as CSSProperties}>
            {/* Supplied decorative SVGs are local; no image optimizer or remote request needed. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/images/not-found/figure-${figure.source}.svg`} alt="" width={160} height={160} draggable={false} />
          </div>
        ))}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.restingFigure} src="/images/not-found/figure-4.svg" alt="" width={160} height={160} draggable={false} />
      </div>
      <section className={styles.message}>
        <h1 id="missing-page-title">Page Not Found</h1>
        <p className={styles.code}>404</p>
        <p className={styles.description}>The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.</p>
        <div className={styles.actions}>
          <button type="button" onClick={goBack} className={styles.back}><ArrowLeft size={20} aria-hidden="true" />Go Back</button>
          <Link href="/" className={styles.home}><House size={20} aria-hidden="true" />Go Home</Link>
        </div>
        <p className={styles.emergency}>For an emergency, <a href="tel:911">call 911</a>.</p>
      </section>
    </main>
  );
}

function CircleAnimation({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const completed = useRef(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active || completed.current) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let start: number | null = null;
    let width = 0;
    let height = 0;
    let ground = "";
    let reveal = "";
    const readPalette = () => {
      const palette = getComputedStyle(canvas.parentElement!);
      ground = palette.getPropertyValue("--muted").trim();
      reveal = palette.backgroundColor;
    };
    // Stable positions; no random values or browser branches in the rendered HTML.
    const circles = Array.from({ length: 120 }, (_, index) => ({
      x: 1.15 + ((index * 37) % 120) / 65,
      y: ((index * 53) % 120) / 100 - 0.1,
    }));
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width; height = bounds.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.ceil(width * dpr); canvas.height = Math.ceil(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (now: number) => {
      start ??= now;
      const progress = Math.min((now - start) / 2800, 1);
      context.fillStyle = ground;
      context.fillRect(0, 0, width, height);
      context.fillStyle = reveal;
      for (const circle of circles) {
        context.beginPath();
        context.arc((circle.x - progress * 2.8) * width, circle.y * height,
          width * (0.002 + progress * 0.16), 0, Math.PI * 2);
        context.fill();
      }
      if (progress < 1) frame = requestAnimationFrame(draw);
      else { context.clearRect(0, 0, width, height); completed.current = true; }
    };
    readPalette();
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const themeObserver = new MutationObserver(readPalette);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); themeObserver.disconnect(); context.clearRect(0, 0, width, height); };
  }, [active]);
  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />;
}
