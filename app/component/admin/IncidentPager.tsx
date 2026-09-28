import { ContinuousPagination } from "@/app/component/ui/continuous-pagination";

interface IncidentPagerProps {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  hideWhenSinglePage?: boolean;
}

export default function IncidentPager({
  page,
  pages,
  total,
  pageSize,
  onPageChange,
  hideWhenSinglePage = false,
}: IncidentPagerProps) {
  if (total === 0 || (hideWhenSinglePage && pages <= 1)) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="my-5 flex flex-col items-center gap-3" aria-label="Incident reports pagination">
      {pages > 1 && (
        <ContinuousPagination
          totalPages={pages}
          value={page}
          onChange={onPageChange}
        />
      )}
      <span className="text-xs text-gray-600 font-medium" aria-live="polite">
        Showing {first}-{last} of {total} reports
      </span>
    </div>
  );
}
