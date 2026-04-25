import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { Modal } from "../components/Modal";
import { TablePagination } from "../components/TablePagination";
import { dispatchNotificationsInboxChanged } from "../notificationSync";
import { NotificationKind, NotificationSeverity, UserNotification } from "../types";

const kindLabel: Record<NotificationKind, string> = {
  APPLICATION_UPDATE: "Application",
  COMPANY_UPDATE: "Company",
  SYSTEM_ERROR: "System",
  FOLLOW_UP_DRAFT: "Follow-up draft"
};

const severityClass = (t: NotificationSeverity) => {
  if (t === "SUCCESS") return "badge-success";
  if (t === "FAILED") return "badge-error";
  return "badge-warning";
};

const PAGE_SIZE = 10;

/** ISO timestamp string for optimistic read rows */
function nowIso() {
  return new Date().toISOString();
}

export const NotificationsPage = () => {
  const [items, setItems] = useState<UserNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(new Set());
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<string[] | null>(null);

  const load = async (targetPage = page, unreadOnly = showOnlyActive) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listNotificationsPage({
        unreadOnly,
        skip: (targetPage - 1) * PAGE_SIZE,
        limit: PAGE_SIZE
      });
      setItems(response.items);
      setTotal(response.total);
      setHasNextPage(response.has_next);
      dispatchNotificationsInboxChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(page, showOnlyActive);
  }, [page, showOnlyActive]);

  useEffect(() => {
    if (items.length === 0 && page > 1) {
      setPage((current) => Math.max(1, current - 1));
    }
  }, [items.length, page]);

  useEffect(() => {
    setSelectedIds(new Set());
    setExpandedMessageIds(new Set());
  }, [items, page, showOnlyActive]);

  const selectableIds = useMemo(
    () => new Set(items.map((n) => n.id)),
    [items]
  );

  const reduceVisibleTotal = (count: number) => {
    if (count <= 0) return;
    setTotal((current) => {
      const next = Math.max(0, current - count);
      setHasNextPage(page * PAGE_SIZE < next);
      return next;
    });
  };

  const allOnPageSelected =
    selectableIds.size > 0 &&
    [...selectableIds].every((id) => selectedIds.has(id));

  const toggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(selectableIds));
  };

  const toggleRowSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const markReadOptimistic = (id: string) => {
    const ts = nowIso();
    const row = items.find((n) => n.id === id);
    const removeFromActiveView = showOnlyActive && row && !row.read_at;
    setItems((prev) => {
      if (removeFromActiveView) return prev.filter((n) => n.id !== id);
      return prev.map((n) =>
        n.id === id ? { ...n, read_at: ts } : n
      );
    });
    if (removeFromActiveView) reduceVisibleTotal(1);
    dispatchNotificationsInboxChanged();
    void api.markNotificationRead(id).catch(() => {
      void load(page, showOnlyActive);
    });
  };

  const deleteSelected = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const removedCount = items.filter((n) => idSet.has(n.id)).length;
    setItems((prev) => prev.filter((n) => !idSet.has(n.id)));
    setSelectedIds(new Set());
    setDeleteConfirmIds(null);
    reduceVisibleTotal(removedCount);
    dispatchNotificationsInboxChanged();
    void api.deleteNotificationsBulk(ids).catch(() => {
      void load(page, showOnlyActive);
    });
  };

  const handleBulkMarkRead = () => {
    const unreadSelected = items.filter((n) => selectedIds.has(n.id) && !n.read_at);
    if (unreadSelected.length === 0) return;
    const ids = unreadSelected.map((n) => n.id);
    const ts = nowIso();
    if (showOnlyActive) {
      const idSet = new Set(ids);
      setItems((prev) => prev.filter((n) => !idSet.has(n.id)));
      reduceVisibleTotal(ids.length);
    } else {
      setItems((prev) =>
        prev.map((n) =>
          selectedIds.has(n.id) && !n.read_at ? { ...n, read_at: ts } : n
        )
      );
    }
    dispatchNotificationsInboxChanged();
    void api.markNotificationsReadBulk(ids).catch(() => {
      void load(page, showOnlyActive);
    });
  };

  const toggleMessageExpanded = (id: string) => {
    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Notifications</h2>
      {error && <div className="alert alert-error">{error}</div>}
      <label className="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 bg-base-100 px-3 py-2">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={showOnlyActive}
          onChange={(event) => {
            setPage(1);
            setShowOnlyActive(event.target.checked);
          }}
        />
        <span className="label-text">Show only active notifications</span>
      </label>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-sm btn-outline" onClick={toggleSelectAllOnPage}>
            {allOnPageSelected ? "Unselect all" : "Select all"}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-error btn-outline"
            disabled={selectedIds.size === 0}
            onClick={() => setDeleteConfirmIds([...selectedIds])}
          >
            Delete selected ({selectedIds.size})
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            disabled={
              selectedIds.size === 0 ||
              !items.some((n) => selectedIds.has(n.id) && !n.read_at)
            }
            onClick={handleBulkMarkRead}
          >
            Mark selected read
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-base-300 bg-base-100 shadow">
        <table className="table table-zebra table-sm">
          <thead>
            <tr>
              <th className="w-10 py-2">
                <span className="sr-only">Select</span>
              </th>
              <th className="py-2">Notification</th>
              <th className="py-2">Type</th>
              <th className="py-2">Time</th>
              <th className="py-2">Message</th>
              <th className="py-2">Open</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((n) => {
              const isExpanded = expandedMessageIds.has(n.id);
              return (
              <tr key={n.id} className={n.read_at ? "opacity-75" : ""}>
                <td className="py-2 align-middle">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={selectedIds.has(n.id)}
                    onChange={() => toggleRowSelected(n.id)}
                    aria-label={`Select notification ${n.id}`}
                  />
                </td>
                <td className="py-2">
                  <span className="font-medium">{kindLabel[n.notification]}</span>
                  {n.check && (
                    <span className="badge badge-outline badge-xs ml-2" title="Check requested">
                      Check
                    </span>
                  )}
                </td>
                <td className="py-2">
                  <span className={`badge badge-sm ${severityClass(n.type)}`}>{n.type}</span>
                </td>
                <td className="whitespace-nowrap py-2 text-xs opacity-80">
                  {new Date(n.timestamp).toLocaleString()}
                </td>
                <td className="py-2">
                  <div className="max-w-md space-y-1">
                    <div
                      className={`text-sm ${isExpanded ? "whitespace-normal break-words" : "truncate"}`}
                      title={n.payload.message}
                      aria-label={`Notification message: ${n.payload.message}`}
                    >
                      {n.payload.message}
                    </div>
                    <button
                      type="button"
                      className="link link-primary text-xs"
                      onClick={() => toggleMessageExpanded(n.id)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? "Collapse message" : "Show full message"}
                    </button>
                  </div>
                </td>
                <td className="py-2">
                  {n.link ? (
                    <Link to={n.link} className="link link-primary text-sm">
                      View
                    </Link>
                  ) : (
                    <span className="text-sm opacity-50">—</span>
                  )}
                </td>
                <td className="py-2">
                  {n.read_at ? (
                    <span className="badge badge-ghost badge-sm">Read</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={() => markReadOptimistic(n.id)}
                    >
                      Mark read
                    </button>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={page}
        hasNextPage={hasNextPage}
        onPageChange={setPage}
        disabled={loading}
        pageSize={PAGE_SIZE}
        visibleCount={items.length}
        totalCount={total}
        itemLabel="notifications"
      />
      {items.length === 0 && !loading && (
        <p className="text-sm opacity-70">
          {showOnlyActive ? "No active notifications." : "No notifications."}
        </p>
      )}
      <Modal
        open={deleteConfirmIds !== null}
        onClose={() => setDeleteConfirmIds(null)}
        title="Delete selected notifications"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm">
            Delete {deleteConfirmIds?.length ?? 0} selected notification
            {(deleteConfirmIds?.length ?? 0) === 1 ? "" : "s"}? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setDeleteConfirmIds(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-error"
              onClick={() => deleteSelected(deleteConfirmIds ?? [])}
            >
              Delete notifications
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
