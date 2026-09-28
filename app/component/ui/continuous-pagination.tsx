'use client';

import { useMemo, useState, type FC, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ContinuousPaginationProps {
  totalPages?: number;
  value?: number;
  defaultPage?: number;
  onChange?: (page: number) => void;
}

interface PageButtonProps {
  children: ReactNode;
  onClick: () => void;
  ariaLabel: string;
  disabled?: boolean;
}

const PageButton: FC<PageButtonProps> = ({ children, onClick, ariaLabel, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    disabled={disabled}
    className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-[background-color,border-color,color,box-shadow] duration-200 hover:border-muted-foreground/40 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40"
  >
    {children}
  </button>
);

function getVisiblePages(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages: number[] = [];
  const addPage = (page: number) => {
    if (page >= 1 && page <= total && !pages.includes(page)) pages.push(page);
  };

  addPage(1);
  if (current > 3) pages.push(-1);
  addPage(current - 1);
  addPage(current);
  addPage(current + 1);
  if (current < total - 2) pages.push(-1);
  addPage(total);

  return pages;
}

export const ContinuousPagination: FC<ContinuousPaginationProps> = ({
  totalPages = 5,
  value,
  defaultPage = 1,
  onChange,
}) => {
  const isControlled = value !== undefined;
  const [internalPage, setInternalPage] = useState(defaultPage);
  const active = Math.min(Math.max(isControlled ? value : internalPage, 1), Math.max(totalPages, 1));
  const visiblePages = useMemo(() => getVisiblePages(active, totalPages), [active, totalPages]);

  const paginate = (page: number) => {
    if (page < 1 || page > totalPages || page === active) return;
    if (!isControlled) setInternalPage(page);
    onChange?.(page);
  };

  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Report pages" className="flex items-center justify-center gap-1.5 text-sm sm:gap-2">
      <PageButton ariaLabel="Previous page" onClick={() => paginate(active - 1)} disabled={active === 1}>
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </PageButton>

      <span className="min-w-24 text-center text-sm font-semibold text-foreground sm:hidden">
        Page {active} of {totalPages}
      </span>

      <div className="hidden gap-1.5 sm:flex sm:gap-2">
        {visiblePages.map((page, index) => {
          if (page === -1) {
            return (
              <span
                key={`ellipsis-${index}`}
                aria-hidden="true"
                className="flex h-11 w-7 select-none items-center justify-center text-muted-foreground"
              >
                &hellip;
              </span>
            );
          }

          const isActive = page === active;
          return (
            <button
              key={page}
              type="button"
              onClick={() => paginate(page)}
              aria-label={`Go to page ${page}`}
              aria-current={isActive ? 'page' : undefined}
              className={`flex h-11 w-11 items-center justify-center rounded-lg border text-sm font-semibold shadow-sm transition-[background-color,border-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted hover:text-foreground'
              }`}
            >
              {page}
            </button>
          );
        })}
      </div>

      <PageButton ariaLabel="Next page" onClick={() => paginate(active + 1)} disabled={active === totalPages}>
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </PageButton>
    </nav>
  );
};
