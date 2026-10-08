"use client";
import { useEffect, useState, type RefObject } from "react";
import { useLandingReducedMotion } from "@/app/component/landing/useLandingReducedMotion";

// No animation on the server, in hidden tabs, outside the viewport, or with reduced motion.
export function useMotionActivity(ref: RefObject<HTMLElement | null>) {
 const reduced = useLandingReducedMotion();
 const [visible, setVisible] = useState(false);
 const [foreground, setForeground] = useState(false);
 useEffect(() => {
   const update = () => setForeground(document.visibilityState === "visible");
   update();
   document.addEventListener("visibilitychange", update);
   if (typeof IntersectionObserver !== "function") {
     // Static content remains available on older/limited browsers.
     return () => document.removeEventListener("visibilitychange", update);
   }
   const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
   if (ref.current) observer.observe(ref.current);
   return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
 }, [ref]);
 return !reduced && visible && foreground;
}
