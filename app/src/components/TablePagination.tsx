type TablePaginationProps = {
  page: number;
  hasNextPage: boolean;
  onPageChange: (nextPage: number) => void;
  disabled?: boolean;
  pageSize?: number;
  visibleCount?: number;
  totalCount?: number;
  itemLabel?: string;
  rangeSuffix?: string;
};

export const TablePagination = ({
  page,
  hasNextPage,
  onPageChange,
  disabled = false,
  pageSize,
  visibleCount,
  totalCount,
  itemLabel = "results",
  rangeSuffix = ""
}: TablePaginationProps) => {
  const canGoPrevious = page > 1;
  const totalPages = totalCount === undefined || pageSize === undefined ? null : Math.max(1, Math.ceil(totalCount / pageSize));
  const canGoNext = totalPages === null ? hasNextPage : page < totalPages;
  const canGoLast = totalPages !== null && page < totalPages;
  const maxVisible = 5;
  const startPage = Math.max(1, page - 2);
  const endPage = totalPages === null ? page : Math.min(totalPages, Math.max(page, startPage + maxVisible - 1));
  const rawPages = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index);
  const pageButtons = rawPages.slice(-maxVisible);
  const showLeadingEllipsis = pageButtons.length > 0 && pageButtons[0] > 2;
  const rangeStart = pageSize && visibleCount ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = pageSize && visibleCount ? rangeStart + visibleCount - 1 : 0;
  const rangeText =
    pageSize === undefined || visibleCount === undefined
      ? `Page ${page}`
      : visibleCount > 0
        ? `Showing ${rangeStart}-${rangeEnd}${totalCount === undefined ? "" : ` of ${totalCount}`} ${itemLabel}${rangeSuffix}`
        : `No ${itemLabel} on this page${rangeSuffix}`;

  return (
    <nav className="mt-3 flex flex-wrap items-center justify-between gap-2" aria-label="Table pagination">
      <p className="text-xs opacity-70" aria-live="polite">
        {rangeText}
      </p>
      <div className="max-w-full overflow-x-auto">
        <div className="join shadow-sm">
          <button
            type="button"
            className="btn btn-sm join-item"
            onClick={() => onPageChange(1)}
            disabled={!canGoPrevious || disabled}
            aria-label="Go to first page"
          >
            First
          </button>
          <button
            type="button"
            className="btn btn-sm join-item"
            onClick={() => onPageChange(page - 1)}
            disabled={!canGoPrevious || disabled}
            aria-label="Go to previous page"
          >
            Previous
          </button>

          {showLeadingEllipsis ? (
            <span className="btn btn-sm join-item btn-disabled pointer-events-none" aria-hidden="true">
              …
            </span>
          ) : null}

          {pageButtons.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              className={`btn btn-sm join-item ${pageNumber === page ? "btn-active" : "btn-ghost"}`}
              onClick={() => onPageChange(pageNumber)}
              aria-current={pageNumber === page ? "page" : undefined}
              aria-label={pageNumber === page ? `Current page, page ${pageNumber}` : `Go to page ${pageNumber}`}
              disabled={disabled}
            >
              {pageNumber}
            </button>
          ))}

          {totalPages === null && hasNextPage ? (
            <button
              type="button"
              className="btn btn-sm join-item btn-ghost"
              onClick={() => onPageChange(page + 1)}
              aria-label={`Go to page ${page + 1}`}
              disabled={disabled}
            >
              {page + 1}
            </button>
          ) : null}

          <button
            type="button"
            className="btn btn-sm join-item"
            onClick={() => onPageChange(page + 1)}
            disabled={!canGoNext || disabled}
            aria-label="Go to next page"
          >
            Next
          </button>

          {totalPages !== null ? (
            <button
              type="button"
              className="btn btn-sm join-item"
              onClick={() => onPageChange(totalPages)}
              disabled={!canGoLast || disabled}
              aria-label="Go to last page"
            >
              Last
            </button>
          ) : null}
        </div>
      </div>
    </nav>
  );
};
