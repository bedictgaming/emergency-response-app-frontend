'use client';
// Adapted from the supplied chetanverma16/notification-popover reference.
// Live controlled data replaces template demos; read actions stay browser-local.
import { useId } from 'react';
import { Bell, ChevronRight, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Popover, PopoverContent, PopoverTrigger, PopoverTitle, PopoverDescription } from './popover';

export interface NotificationItem {
  id: string; title: string; description: string; reportTitle: string;
  timestamp: string; time: string; unread: boolean;
}
type Props = {
  items: NotificationItem[]; open: boolean; onOpenChange: (open: boolean) => void;
  loading: boolean; error?: string; caption: string; readWarning?: string;
  onRetry: () => void; onRead: (id: string) => void; onReadAll: () => void; onView: (id: string) => void;
};
const action = 'inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg px-2 text-xs font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default disabled:text-white/50 disabled:hover:bg-transparent';
const shortDate = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).format(new Date(value));

export function NotificationPopover({ items, open, onOpenChange, loading, error, caption, readWarning, onRetry, onRead, onReadAll, onView }: Props) {
  const countId = useId(), reducedMotion = useReducedMotion();
  const unread = items.filter(item => item.unread).length;
  return <Popover open={open} onOpenChange={onOpenChange} modal>
    <PopoverTrigger asChild>
      <button type="button" aria-label="Report notifications" aria-describedby={countId}
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#111111]/80 text-white shadow-[0_0_20px_rgba(0,0,0,0.2)] transition-colors hover:bg-[#111111]/95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:bg-[#242424] dark:ring-1 dark:ring-inset dark:ring-white/30 dark:hover:bg-[#303030]">
        <Bell size={16} aria-hidden="true" />
        {unread > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-gray-800 bg-black px-1 text-xs font-medium text-white">{unread}</span>}
        <span id={countId} className="sr-only" aria-live="polite">{unread} unread review updates</span>
      </button>
    </PopoverTrigger>
    <AnimatePresence initial={false}>
      {open && <PopoverContent key="report-notifications" forceMount asChild aria-label="Report notifications"
        className="flex max-h-[min(25rem,var(--radix-popover-content-available-height))] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border-white/20 bg-[#111111]/95 p-0 text-white shadow-lg backdrop-blur-sm selection:bg-white/25 selection:text-white">
        <motion.div initial={reducedMotion ? false : { opacity: 0.8, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.95 }} transition={{ duration: reducedMotion ? 0 : 0.2, ease: 'easeOut' }}>
          <div className="flex shrink-0 items-center gap-1 border-b border-white/20 px-4 py-2">
            <PopoverTitle className="min-w-0 flex-1 text-sm font-medium">Notifications</PopoverTitle>
            <PopoverDescription className="sr-only">{caption} Select an unread update to mark it as read, or view its report.</PopoverDescription>
            <button type="button" onClick={onReadAll} disabled={loading || Boolean(error) || unread === 0}
              title="Mark only the currently displayed review updates as read" className={action}>Mark all as read</button>
            <button type="button" aria-label="Close notifications" onClick={() => onOpenChange(false)} className={`${action} -mr-2 h-12 w-12 shrink-0 p-0`}><X size={16} aria-hidden="true" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:rgba(255,255,255,0.28)_transparent]">
            {error && <div role="alert" className="p-4 text-sm leading-relaxed text-white/80"><p>{error}</p><button type="button" onClick={onRetry} className={`${action} mt-2 underline underline-offset-4`}>Retry notifications</button></div>}
            {loading && items.length === 0 && <p role="status" className="p-4 text-sm text-white/80">Checking report review updates…</p>}
            {!error && !loading && items.length === 0 && <p className="p-5 text-center text-sm text-white/80">No report review notifications.</p>}
            {items.length > 0 && <ul aria-label="Your report review updates" className="divide-y divide-white/20">{items.map((item, index) => <motion.li key={item.id}
              initial={reducedMotion ? false : { opacity: 0.8, x: 8, filter: 'blur(3px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              transition={{ duration: reducedMotion ? 0 : 0.18, delay: reducedMotion ? 0 : Math.min(index, 3) * 0.03, ease: 'easeOut' }} className="min-w-0">
              <button type="button" onClick={() => { if (item.unread) onRead(item.id); }} aria-disabled={!item.unread}
                aria-label={`${item.unread ? 'Mark as read' : 'Read'}: ${item.title} — ${item.reportTitle}`}
                aria-describedby={`${countId}-description-${index} ${countId}-time-${index}`}
                className="block min-h-12 w-full p-4 pb-2 text-start transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white">
                <span className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-start gap-2">
                    {item.unread && <span data-notification-unread-dot aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#ffffff]" />}
                    <span className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere]">{item.title}</span>
                  </span>
                  <time id={`${countId}-time-${index}`} dateTime={item.timestamp} title={item.time} aria-label={item.time} className="shrink-0 pt-0.5 text-xs tabular-nums text-white/80">{shortDate(item.timestamp)}</time>
                </span>
                <span className="mt-1 block break-words text-xs font-medium leading-relaxed text-white/90 [overflow-wrap:anywhere]">{item.reportTitle}</span>
                <span id={`${countId}-description-${index}`} className="mt-1 block break-words text-xs leading-relaxed text-white/80 [overflow-wrap:anywhere]">{item.description}</span>
              </button>
              <div className="flex items-center justify-between gap-3 px-4 pb-2">
                <span className="text-xs text-white/80">{item.unread ? 'Unread' : 'Read'}</span>
                <button type="button" onClick={() => onView(item.id)} aria-label={`View report: ${item.reportTitle}`} className={`${action} -mr-2 gap-1 underline underline-offset-4`}>View report<ChevronRight size={14} aria-hidden="true" /></button>
              </div>
            </motion.li>)}</ul>}
          </div>
          <div className="shrink-0 border-t border-white/20 px-4 py-3 text-xs leading-relaxed text-white/80">
            <p>{caption}</p><p role="status" className="mt-1">{readWarning || 'Read status is saved in this browser only. Reading does not change your report.'}</p>
          </div>
        </motion.div>
      </PopoverContent>}
    </AnimatePresence>
  </Popover>;
}
