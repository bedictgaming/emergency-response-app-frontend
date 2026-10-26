'use client';
import { useEffect, useState } from 'react';
import { NotificationPopover } from '@/components/ui/notification-popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CompactEvidencePhoto } from '@/components/shared/SecureEvidencePhoto';
import { IncidentLocationMap } from '@/components/shared/IncidentLocationMap';
import { useCitizenReviewNotifications } from '@/hooks/useCitizenReviewNotifications';
import { citizenReviewIdentity, notificationReceipt, type CitizenReviewNotification } from '@/lib/services/citizenNotificationService';
import { getIncidentById, type Incident } from '@/lib/services/incidentService';

const departmentNames = { MAIN: 'Main Admin', FIRE: 'Fire', MEDICAL: 'Medical', POLICE: 'Police', DRRMO: 'DRRMO' };
const formatTime = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) + ' (Manila)';
const titleFor = (item: CitizenReviewNotification) => `${departmentNames[item.department]} · ${item.status === 'PENDING' ? 'Report flagged for review' : item.status === 'CONFIRMED' ? 'Department assessment recorded' : 'Suspicion dismissed'}`;
const descriptionFor = (item: CitizenReviewNotification) => item.status === 'PENDING'
  ? 'This department flagged your report for review. A flag alone is not a confirmed false report or a violation. Response status is separate.'
  : item.status === 'CONFIRMED'
    ? 'This department recorded a false-report assessment. Any violation or sanction follows the report-review rules; this notice alone does not determine your account status.'
    : 'This department dismissed its suspicion. This does not automatically reopen a cancelled report or reactivate an account.';

export function CitizenReviewNotifications({ userId }: { userId: string }) {
  const feed = useCitizenReviewNotifications(userId);
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ identity: string; id: string; report?: Incident; error?: boolean } | null>(null);
  const [detailRevision, setDetailRevision] = useState(0);
  useEffect(() => {
    const clear = (event: StorageEvent) => {
      if (!event.key || ['user','emergency-logout-epoch','emergency-session-generation'].includes(event.key)) { setOpen(false); setSelected(null); setDetail(null); }
    };
    window.addEventListener('storage', clear); return () => window.removeEventListener('storage', clear);
  }, []);
  useEffect(() => {
    const identity = feed.identity;
    if (!selected || !identity) return;
    const controller = new AbortController();
    void getIncidentById(selected, controller.signal).then(report => {
      if (controller.signal.aborted || citizenReviewIdentity(userId) !== identity) return;
      setDetail(report.incidentId === selected && report.reportedBy === userId
        ? { identity, id: selected, report } : { identity, id: selected, error: true });
    }).catch(() => {
      if (!controller.signal.aborted && citizenReviewIdentity(userId) === identity) setDetail({ identity, id: selected, error: true });
    });
    return () => controller.abort();
  }, [selected, feed.identity, userId, detailRevision]);
  const current = detail?.identity === feed.identity && detail.id === selected ? detail : null;
  const report = current?.report;
  const resolve = (receipt: string) => feed.items.find(item => notificationReceipt(item) === receipt);
  return <>
    <NotificationPopover key={feed.identity ?? 'signed-out'} open={Boolean(open && feed.identity)} onOpenChange={value => { setOpen(value); if (value) void feed.refresh(); }}
      items={feed.items.map(item => ({ id: notificationReceipt(item), title: titleFor(item), reportTitle: item.reportTitle,
        description: descriptionFor(item), timestamp: item.updatedAt, time: formatTime(item.updatedAt), unread: !feed.isRead(item) }))}
      loading={feed.loading} error={feed.error} caption={feed.hasMore ? 'Showing your latest 50 department review updates.' : 'Latest department review updates for your own reports.'}
      readWarning={feed.readWarning} onRetry={() => void feed.refresh()} onRead={id => { const item = resolve(id); if (item) feed.markRead(item); }}
      onReadAll={feed.markAllRead}
      onView={id => { const item = resolve(id); if (!item || !feed.identity) return; feed.markRead(item); setOpen(false); setDetail(null); setSelected(item.incidentId); }} />
    <Dialog open={Boolean(selected && feed.identity)} onOpenChange={value => { if (!value) { setSelected(null); setDetail(null); } }}>
      <DialogContent className="max-w-xl" closeBar>
        <DialogHeader><DialogTitle>Your reported emergency</DialogTitle><DialogDescription>Review notifications do not change the recorded response status. Only your own authorized report can appear here.</DialogDescription></DialogHeader>
        {current?.error ? <div role="alert"><p className="text-sm">This report could not be loaded or is no longer available to your account.</p><button type="button" onClick={() => { setDetail(null); setDetailRevision(value => value + 1); }} className="mt-3 min-h-11 rounded-lg border border-border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Retry report</button></div>
          : report ? <section aria-label="Your report details" className="min-w-0 space-y-4 break-words">
            <h3 className="text-base font-semibold">{report.title}</h3>
            <p className="text-sm">Current recorded status: <strong>{report.status}</strong></p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{report.description}</p>
            <p className="text-sm">Services: {report.requestedServices?.join(' / ') || report.type?.typeName || 'See report'}</p>
            <p className="text-sm">Location: {report.location?.address || report.location?.locationName || 'Recorded report pin'}</p>
            {report.attachments?.[0]?.fileUrl && <CompactEvidencePhoto sourceUrl={report.attachments[0].fileUrl} alt="Your submitted report evidence" />}
            <IncidentLocationMap latitude={report.latitude == null ? undefined : Number(report.latitude)} longitude={report.longitude == null ? undefined : Number(report.longitude)} />
          </section> : <p role="status" className="text-sm text-muted-foreground">Loading your authorized report…</p>}
      </DialogContent>
    </Dialog>
  </>;
}
