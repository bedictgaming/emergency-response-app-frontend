"use client";
import * as React from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/utils";
import { useMotionActivity } from "./use-motion-activity";

export interface LoaderSkeletonProps extends HTMLMotionProps<"div"> {
 width?: string | number;
 height?: number;
 borderRadius?: number;
 baseColor?: string;
 highlightColor?: string;
 duration?: number;
}
export function LoaderSkeleton({
 className, width = "100%", height = 20, borderRadius = 4,
 baseColor, highlightColor, duration = 1.5, style, ...props
}: LoaderSkeletonProps) {
 const ref = React.useRef<HTMLDivElement>(null);
 const active = useMotionActivity(ref);
 return <motion.div {...props} ref={ref} aria-hidden="true" data-loader-skeleton
   className={cn("relative overflow-hidden bg-muted", className)}
   style={{ width, height, borderRadius, ...(baseColor && { backgroundColor: baseColor }), ...style }}>
   {active && <motion.div className="pointer-events-none absolute inset-0" data-skeleton-shimmer
     style={{ background: `linear-gradient(90deg, transparent, ${highlightColor || "rgba(255,255,255,0.3)"}, transparent)` }}
     initial={{ x: "-100%" }} animate={{ x: ["-100%", "100%"] }}
     transition={{ duration: Math.max(0.2, duration), ease: "easeInOut", repeat: Infinity }} />}
 </motion.div>;
}
export default LoaderSkeleton;
