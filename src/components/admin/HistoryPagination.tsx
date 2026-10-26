import type { IncidentsApiResponse } from "@/lib/services/incidentHistoryService";
import { ContinuousPagination } from "@/components/ui/continuous-pagination";

export default function HistoryPagination({ pagination, loading, onPage }: {
  pagination?: IncidentsApiResponse["data"]["pagination"]; loading: boolean; onPage: (page: number) => void;
}) {
  if (!pagination) return null;
  const { page, pages, total, limit } = pagination;
  return <div data-history-pagination className="flex flex-col items-center gap-2 py-4" aria-busy={loading}>
    <ContinuousPagination totalPages={pages} value={page} onChange={onPage}
      ariaLabel="History pages" disabled={loading || total === 0} showWhenSinglePage />
    <span className="text-center text-xs font-medium text-muted-foreground" aria-live="polite" aria-atomic="true">{total === 0 ? '0 records · 0 pages' : `Records ${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total} · Page ${page} of ${pages}`}</span>
  </div>;
}
