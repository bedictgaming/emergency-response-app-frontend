import type { IncidentsApiResponse } from "@/lib/services/incidentHistoryService";

export default function HistoryPagination({ pagination, loading, onPage }: {
  pagination?: IncidentsApiResponse["data"]["pagination"]; loading: boolean; onPage: (page: number) => void;
}) {
  if (!pagination || pagination.pages <= 1) return null;
  const { page, pages, total, limit } = pagination;
  return <nav aria-label="History pages" className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-muted-foreground">
    <span>Records {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} · Page {page} of {pages}</span>
    <div className="flex gap-2">
      <button type="button" disabled={loading || page <= 1} onClick={() => onPage(page - 1)} className="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring">Previous records</button>
      <button type="button" disabled={loading || page >= pages} onClick={() => onPage(page + 1)} className="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring">Next records</button>
    </div>
  </nav>;
}
