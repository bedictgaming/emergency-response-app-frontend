'use client';
import { useCallback, useEffect, useState } from 'react';
import { getIncidentById, type Incident } from '@/lib/services/incidentService';
import { adminAccountSnapshot } from '@/lib/adminAccountSnapshot';
import { useEmergencyEvents } from '@/hooks/useEmergencyEvents';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CompactEvidencePhoto } from '@/components/shared/SecureEvidencePhoto';

export function NearbyReportDialog({ incidentId, onClose }: { incidentId: string | null; onClose: () => void }) {
  const [data, setData] = useState<{ id: string; account: string | null; report?: Incident; error?: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  const account = adminAccountSnapshot();
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEmergencyEvents(refresh, !!incidentId);
  useEffect(() => {
    if (!incidentId || !account) return;
    const controller = new AbortController();
    let active = true;
    void getIncidentById(incidentId, controller.signal).then(report => {
      if (active && adminAccountSnapshot() === account) setData({ id: incidentId, account, report });
    }).catch(() => { if (active && adminAccountSnapshot() === account) setData({ id: incidentId, account, error: true }); });
    return () => { active = false; controller.abort(); };
  }, [incidentId, account, revision]);
  const current = data?.id === incidentId && data.account === account ? data : null;
  return <Dialog open={!!incidentId && !!account} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>Nearby submitted report</DialogTitle><DialogDescription>Read-only report details. Access is checked by the server for your current department.</DialogDescription></DialogHeader>
      {current?.error ? <p role="alert">Report unavailable or outside your current access. Close this view and retry.</p>
        : current?.report ? <div className="space-y-3 break-words">
          <h3 className="font-semibold">{current.report.title}</h3>
          <p className="text-sm">Status: {current.report.status}</p>
          <p className="whitespace-pre-wrap text-sm">{current.report.description}</p>
          <p className="text-sm">Location: {current.report.location?.address || current.report.location?.locationName || 'See the recorded report pin'}</p>
          {current.report.attachments?.[0]?.fileUrl && <CompactEvidencePhoto sourceUrl={current.report.attachments[0].fileUrl} alt="Nearby report evidence" />}
        </div> : <p role="status">Loading authorized report…</p>}
    </DialogContent>
  </Dialog>;
}
