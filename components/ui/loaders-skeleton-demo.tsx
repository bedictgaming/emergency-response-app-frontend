"use client";
import { LoaderSkeleton } from "./loaders-skeleton";
export default function LoaderSkeletonDemo() {
  return <div className="flex min-h-[300px] w-full items-center justify-center bg-background p-8">
    <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-4">
        <LoaderSkeleton width={48} height={48} borderRadius={9999} />
        <div className="flex flex-1 flex-col gap-2"><LoaderSkeleton width="70%" height={14} /><LoaderSkeleton width="40%" height={12} /></div>
      </div>
      <div className="mt-6 flex flex-col gap-3"><LoaderSkeleton height={12} /><LoaderSkeleton height={12} /><LoaderSkeleton width="80%" height={12} /></div>
      <LoaderSkeleton className="mt-6" height={120} borderRadius={12} />
    </div>
  </div>;
}
