type TablePaginationProps = {
  page: number;
  hasNextPage: boolean;
  onPageChange: (nextPage: number) => void;
  disabled?: boolean;
};

export const TablePagination = ({ page, hasNextPage, onPageChange, disabled = false }: TablePaginationProps) => {
  const canGoPrevious = page > 1;
  const canGoNext = hasNextPage;
  const maxVisible = 5;
  const startPage = Math.max(1, page - 2);
  const endPage = page;
  const rawPages = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index);
  const pageButtons = rawPages.slice(-maxVisible);
  const showLeadingFirst = pageButtons.length > 0 && pageButtons[0] > 1;
  const showLeadingEllipsis = pageButtons.length > 0 && pageButtons[0] > 2;

  return (
    <nav className="mt-3 flex items-center justify-center" aria-label="Table pagination">
      <div className="join shadow-sm">
        <button
          type="button"
          className="btn btn-sm join-item"
          onClick={() => onPageChange(page - 1)}
          disabled={!canGoPrevious || disabled}
          aria-label="Go to previous page"
        >
          Previous
        </button>

        {showLeadingFirst ? (
          <button
            type="button"
            className="btn btn-sm join-item btn-ghost"
            onClick={() => onPageChange(1)}
            aria-label="Go to page 1"
            disabled={disabled}
          >
            1
          </button>
        ) : null}

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

        {hasNextPage ? (
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
      </div>
    </nav>
  );
};
