"use client";
import { LoaderSkeleton } from "./loaders-skeleton";

export function LoadingPlaceholder({ label = "Loading…", rows = 3, className = "", layout = "list" }: {
 label?: string; rows?: number; className?: string; layout?: "list" | "panel" | "map";
}) {
 return <div role="status" aria-label={label} aria-live="polite" aria-busy="true" className={`w-full min-w-0 space-y-3 p-4 ${className}`}>
   <p className="text-sm text-muted-foreground">{label}</p>
   {layout === "map" ? <LoaderSkeleton height={180} borderRadius={12} /> :
     <div className="space-y-3" aria-hidden="true">
       {Array.from({ length: rows }, (_, index) => <div key={index} className="flex items-center gap-3">
         {layout === "panel" && <LoaderSkeleton width={44} height={44} borderRadius={12} className="shrink-0" />}
         <div className="min-w-0 flex-1 space-y-2">
           <LoaderSkeleton width={index % 2 ? "65%" : "85%"} height={14} />
           <LoaderSkeleton width="45%" height={10} />
         </div>
       </div>)}
     </div>}
 </div>;
}
