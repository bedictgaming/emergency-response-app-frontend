'use client';

import { useEffect, useRef } from 'react';
import { useLandingReducedMotion } from './useLandingReducedMotion';
import styles from './landing-motion.module.css';

// Original Canvas 2D implementation, not Meng To's purchase-gated component.
// No iframe, remote asset, WebGL context, API access or React frame updates.
export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elapsed = useRef(0);
  const canvasReady = useRef(false);
  const reducedMotion = useLandingReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return; // Ordinary landing surfaces remain the fallback.
    let frame = 0;
    let visible = false;
    let width = 0;
    let height = 0;
    let lastFrame = 0;
    let idle = 0;
    let idleTimer = 0;
    let color = '';
    let particles: { x: number; y: number; speed: number; phase: number; glyph: string }[] = [];

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      ctx.font = '12px ui-monospace, monospace';
      for (const p of particles) {
        const x = ((p.x + elapsed.current * p.speed / Math.max(width, 1)) % 1) * width;
        const y = (p.y + Math.sin(elapsed.current * 0.18 + p.phase) * 0.025) * height;
        ctx.globalAlpha = 0.25 + (Math.sin(p.phase) + 1) * 0.12;
        ctx.fillText(p.glyph, x, y);
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      // Cap drawing at 24fps; background tab time is never accumulated.
      if (now - lastFrame >= 1000 / 24) {
        elapsed.current += lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
        lastFrame = now;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };

    const sync = () => {
      cancelAnimationFrame(frame);
      if (idle && 'cancelIdleCallback' in window) window.cancelIdleCallback(idle);
      window.clearTimeout(idleTimer);
      idle = 0;
      idleTimer = 0;
      frame = 0;
      lastFrame = 0;
      const running = reducedMotion === false && visible && !document.hidden;
      canvas.dataset.running = String(running && canvasReady.current);
      if (running && canvasReady.current) frame = requestAnimationFrame(tick);
      else if (running) {
        const start = () => {
          idle = 0;
          idleTimer = 0;
          if (!visible || document.hidden) return;
          canvasReady.current = true;
          canvas.dataset.running = 'true';
          draw();
          frame = requestAnimationFrame(tick);
        };
        // Decorative glyph rasterization must not compete with first text paint.
        if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(start, { timeout: 1200 });
        else idleTimer = window.setTimeout(start, 120);
      } else if (canvasReady.current) draw();
    };

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      width = box.width;
      height = box.height;
      const dpr = Math.min(window.devicePixelRatio || 1, width < 768 ? 1.25 : 1.5);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let seed = 7147;
      const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      particles = Array.from({ length: width < 768 ? 32 : 72 }, () => ({
        x: random(), y: random(), speed: 3 + random() * 7,
        phase: random() * Math.PI * 2, glyph: random() > 0.7 ? '+' : '.',
      }));
      color = getComputedStyle(canvas).getPropertyValue('--muted-foreground').trim() || '#64748b';
      if (canvasReady.current) draw();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? false;
      sync();
    });
    intersectionObserver.observe(canvas);
    const themeObserver = new MutationObserver(resize);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', sync);
    resize();
    sync();
    return () => {
      cancelAnimationFrame(frame);
      if (idle && 'cancelIdleCallback' in window) window.cancelIdleCallback(idle);
      window.clearTimeout(idleTimer);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [reducedMotion]);

  return <canvas id="landing-particle-layer" ref={canvasRef} aria-hidden="true" className={styles.particles} data-testid="landing-particles" />;
}
