import { Flag } from 'lucide-react';
import type { IncidentReviewNotice as ReviewNotice } from '@/lib/services/incidentService';

const departmentName = (department: ReviewNotice['department']) => ({
  MAIN: 'Main Admin', FIRE: 'Fire', MEDICAL: 'Medical', POLICE: 'Police', DRRMO: 'DRRMO',
})[department] || 'Department unavailable';

export function mergeReviewNotices(...groups: Array<ReviewNotice[] | undefined>): ReviewNotice[] | undefined {
  if (groups.every(group => group === undefined)) return undefined;
  const latest = new Map<string, ReviewNotice>();
  for (const group of groups) for (const notice of group ?? []) {
    const previous = latest.get(notice.reviewFlagId);
    if (!previous || (Date.parse(notice.updatedAt) || 0) > (Date.parse(previous.updatedAt) || 0)) latest.set(notice.reviewFlagId, notice);
  }
  return [...latest.values()];
}

function decisionLabel(notice: ReviewNotice) {
  const department = departmentName(notice.department);
  if (notice.status === 'PENDING') return `Flagged by ${department} — awaiting Main Admin review`;
  if (notice.status === 'CONFIRMED') return `Confirmed false by Main Admin — flagged by ${department}`;
  if (notice.status === 'DISMISSED') return `Flag from ${department} dismissed by Main Admin`;
  return 'Review status unavailable';
}

function updateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Update time unavailable';
  return 'Updated ' + new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
  }).format(date) + ' (Manila)';
}

export default function IncidentReviewNotice({ notices, cancelled = false }: { notices?: ReviewNotice[]; cancelled?: boolean }) {
  if (!notices?.length) return null;
  const confirmed = notices.some(notice => notice.status === 'CONFIRMED');
  const pending = notices.some(notice => notice.status === 'PENDING');
  const dismissed = notices.every(notice => notice.status === 'DISMISSED');
  const heading = notices.length === 1 ? decisionLabel(notices[0])
    : confirmed ? 'Main Admin confirmed a false report'
      : pending ? 'False-report review pending'
        : dismissed ? 'False-report flags dismissed by Main Admin' : 'Review status unavailable';
  return <section aria-label="Shared report review" aria-live="polite" aria-atomic="true"
    className="my-4 min-w-0 border-y border-border py-3">
    <div className={`flex min-w-0 items-start gap-2 ${confirmed || pending ? 'text-warning-foreground' : 'text-foreground'}`}>
      <Flag size={18} className="mt-1 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="break-words text-base font-semibold leading-relaxed">{heading}</p>
        {notices.length > 1 && <p className="mt-1 text-sm leading-relaxed">
          Flagging departments: {[...new Set(notices.map(notice => departmentName(notice.department)))].join(', ')}.
        </p>}
        <p className="mt-2 max-w-prose text-base leading-relaxed text-foreground">
          {cancelled ? 'Main Admin cancelled this report. History and evidence are retained; no department Resolve action is needed. A corrected flag does not reopen the report.'
            : confirmed ? 'This decision does not close any response. Coordinate with Main Admin and record your own department’s outcome.'
            : pending ? 'Suspicion is not a decision. Continue emergency assessment while Main Admin reviews.'
              : dismissed ? 'A dismissed flag no longer classifies this report as false. Continue assessing your own department’s response.'
                : 'The review status could not be understood. Refresh or contact Main Admin; response work remains available.'}
        </p>
      </div>
    </div>
    <details className="mt-2 min-w-0">
      <summary className="min-h-11 cursor-pointer rounded-md py-3 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        View review details ({notices.length})
      </summary>
      <ul className="space-y-4 pt-2">
        {notices.map(notice => <li key={notice.reviewFlagId} className="min-w-0 max-w-prose">
          <p className="break-words text-base font-semibold">{decisionLabel(notice)}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-base leading-relaxed [overflow-wrap:anywhere]">
            <span className="font-medium">Flag reason: </span>{notice.reason || 'Flag reason unavailable.'}
          </p>
          {notice.status !== 'PENDING' && <p className="mt-2 whitespace-pre-wrap break-words text-base leading-relaxed [overflow-wrap:anywhere]">
            <span className="font-medium">Main Admin explanation: </span>{notice.reviewNotes || 'Review explanation unavailable.'}
          </p>}
          <p className="mt-2 text-sm text-muted-foreground">{updateTime(notice.updatedAt)}</p>
        </li>)}
      </ul>
    </details>
  </section>;
}
