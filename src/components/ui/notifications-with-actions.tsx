'use client';
// Adapted from the supplied ruixen.ui/notifications-with-actions component.
// Controlled live items replace demo data; actions never delete report records.
import { useId, useState } from 'react';
import { Bell, GripVertical, CheckCheck, ChevronRight, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Popover, PopoverContent, PopoverTrigger, PopoverTitle, PopoverDescription } from './popover';

export interface NotificationItem { id: string; title: string; description: string; reportTitle: string; time: string; unread: boolean }
type Props = { items: NotificationItem[]; open: boolean; onOpenChange: (open: boolean) => void; loading: boolean;
  error?: string; caption: string; readWarning?: string; onRetry: () => void; onRead: (id: string) => void; onView: (id: string) => void };
const action = 'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
export default function NotificationsWithActions({ items, open, onOpenChange, loading, error, caption, readWarning, onRetry, onRead, onView }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const countId = useId();
  const reducedMotion = useReducedMotion();
  const unread = items.filter(item => item.unread).length;
  return <Popover open={open} onOpenChange={value => { setActiveId(null); onOpenChange(value); }} modal>
    <PopoverTrigger asChild><button type="button" aria-label="Report notifications" aria-describedby={countId} className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unread > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-700 px-1 text-center text-xs font-semibold leading-5 text-white">{unread}</span>}
      <span id={countId} className="sr-only" aria-live="polite">{unread} unread review updates</span>
    </button></PopoverTrigger>
    <PopoverContent aria-label="Report notifications" className="flex max-h-[var(--radix-popover-content-available-height)] flex-col overflow-hidden p-0">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0"><PopoverTitle className="text-base font-semibold">Report notifications</PopoverTitle>
          <PopoverDescription className="mt-1 text-sm text-muted-foreground">{caption}</PopoverDescription></div>
        <button type="button" aria-label="Close notifications" className={`${action} -mr-2 -mt-2 h-11 w-11 shrink-0 p-0`} onClick={() => onOpenChange(false)}><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <div className="min-h-0 max-h-[30rem] overflow-y-auto overscroll-contain">
        {error && <div role="alert" className="p-4 text-sm"><p>{error}</p><button type="button" onClick={onRetry} className={`${action} mt-2 border border-border`}>Retry notifications</button></div>}
        {loading && items.length === 0 && <p role="status" className="p-4 text-sm text-muted-foreground">Checking report review updates…</p>}
        {!error && !loading && items.length === 0 && <p className="p-5 text-center text-sm text-muted-foreground">No report review notifications.</p>}
        {items.length > 0 && <ul aria-label="Your report review updates" className="divide-y divide-border">{items.map(item => <li key={item.id} className="min-w-0 p-4">
          <div className="flex items-start gap-2">
            <motion.div animate={{ x: activeId === item.id ? -2 : 0 }} transition={{ duration: reducedMotion ? 0 : 0.15 }} className="min-w-0 flex-1">
              <p className="break-words text-base font-semibold">{item.title}{item.unread && <span className="ml-2 text-xs font-medium text-red-700 dark:text-red-400">Unread</span>}</p>
              <p className="mt-1 break-words text-sm font-medium [overflow-wrap:anywhere]">{item.reportTitle}</p>
              <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">{item.description}</p>
              <p className="mt-2 text-xs tabular-nums text-muted-foreground">{item.time}</p>
            </motion.div>
            <button type="button" aria-label={`Actions for ${item.title}`} aria-expanded={activeId === item.id} onClick={() => setActiveId(value => value === item.id ? null : item.id)} className={`${action} -mr-2 shrink-0 px-2`}><GripVertical className="h-5 w-5" aria-hidden="true" /></button>
          </div>
          {activeId === item.id && <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-2">
            <button type="button" onClick={() => onRead(item.id)} disabled={!item.unread} className={`${action} border border-border disabled:opacity-50`}><CheckCheck className="h-4 w-4" aria-hidden="true" />{item.unread ? 'Mark as read' : 'Read'}</button>
            <button type="button" onClick={() => onView(item.id)} className={`${action} border border-border`}>View report<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          </div>}
        </li>)}</ul>}
      </div>
      <p role="status" className="shrink-0 border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">{readWarning || 'Read status is saved for this account in this browser only. Reading a notification does not change your report.'}</p>
    </PopoverContent>
  </Popover>;
}
