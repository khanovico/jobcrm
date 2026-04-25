import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { TablePagination } from "../components/TablePagination";
import { AuditEvent } from "../types";

const AUDIT_PAGE_SIZE = 50;

type AuditFilters = {
  actor: "" | "user" | "agent";
  action: string;
  entityType: string;
  fromDate: string;
  toDate: string;
};

const EMPTY_FILTERS: AuditFilters = {
  actor: "",
  action: "",
  entityType: "",
  fromDate: "",
  toDate: ""
};

const toFromTimestamp = (date: string) => (date ? `${date}T00:00:00.000Z` : "");
const toToTimestamp = (date: string) => (date ? `${date}T23:59:59.999Z` : "");

const truncateId = (value: string) => (value.length > 10 ? `${value.slice(0, 8)}…` : value);

export const AuditPage = () => {
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [pendingFilters, setPendingFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const entityHrefByType = useMemo(
    () => ({
      company: (id: string) => `/companies/${id}`,
      application: (id: string) => `/applications/${id}`,
      profile: (id: string) => `/profiles/${id}`,
      notification: () => "/notifications"
    }),
    []
  );

  const load = useCallback(
    async (targetPage = page) => {
      setError(null);
      try {
        const params = new URLSearchParams();
        if (filters.actor) params.set("actor_type", filters.actor);
        if (filters.action.trim()) params.set("action", filters.action.trim());
        if (filters.entityType.trim()) params.set("entity_type", filters.entityType.trim());
        if (filters.fromDate) params.set("from_ts", toFromTimestamp(filters.fromDate));
        if (filters.toDate) params.set("to_ts", toToTimestamp(filters.toDate));
        params.set("skip", String((targetPage - 1) * AUDIT_PAGE_SIZE));
        params.set("limit", String(AUDIT_PAGE_SIZE + 1));
        const nextRows = await api.listAuditEvents(params);
        setRows(nextRows.slice(0, AUDIT_PAGE_SIZE));
        setHasNextPage(nextRows.length > AUDIT_PAGE_SIZE);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [filters, page]
  );

  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  useEffect(() => {
    if (rows.length === 0 && page > 1) {
      setPage((current) => Math.max(1, current - 1));
    }
  }, [rows.length, page]);

  const applyFilters = () => {
    setFilters({
      actor: pendingFilters.actor,
      action: pendingFilters.action,
      entityType: pendingFilters.entityType,
      fromDate: pendingFilters.fromDate,
      toDate: pendingFilters.toDate
    });
    setPage(1);
  };

  const clearFilters = () => {
    setPendingFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const toggleMetadata = (rowId: string) => {
    setExpandedRows((current) => ({ ...current, [rowId]: !current[rowId] }));
  };

  const copyId = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
    } catch {
      setCopiedValue(null);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Audit trail</h2>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <label className="form-control">
          <span className="label-text text-xs">Actor</span>
          <select
            aria-label="Actor filter"
            className="select select-bordered select-sm"
            value={pendingFilters.actor}
            onChange={(e) =>
              setPendingFilters((current) => ({
                ...current,
                actor: e.target.value as AuditFilters["actor"]
              }))
            }
          >
            <option value="">All</option>
            <option value="user">User</option>
            <option value="agent">Agent</option>
          </select>
        </label>
        <label className="form-control">
          <span className="label-text text-xs">Action</span>
          <input
            aria-label="Action filter"
            type="text"
            className="input input-bordered input-sm"
            value={pendingFilters.action}
            onChange={(e) => setPendingFilters((current) => ({ ...current, action: e.target.value }))}
            placeholder="create"
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs">Entity</span>
          <input
            aria-label="Entity filter"
            type="text"
            className="input input-bordered input-sm"
            value={pendingFilters.entityType}
            onChange={(e) =>
              setPendingFilters((current) => ({
                ...current,
                entityType: e.target.value
              }))
            }
            placeholder="application"
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs">From</span>
          <input
            aria-label="From date filter"
            type="date"
            className="input input-bordered input-sm"
            value={pendingFilters.fromDate}
            onChange={(e) =>
              setPendingFilters((current) => ({
                ...current,
                fromDate: e.target.value
              }))
            }
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs">To</span>
          <input
            aria-label="To date filter"
            type="date"
            className="input input-bordered input-sm"
            value={pendingFilters.toDate}
            onChange={(e) =>
              setPendingFilters((current) => ({
                ...current,
                toDate: e.target.value
              }))
            }
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-sm" onClick={applyFilters}>
          Apply filters
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={clearFilters}>
          Clear
        </button>
        <button type="button" className="btn btn-sm" onClick={() => void load(page)}>
          Refresh
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td>
                  <span className="badge badge-ghost badge-sm">{r.actor_type}</span>
                  <span className="ml-1 font-mono text-xs opacity-70">{truncateId(r.actor_id)}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs ml-1"
                    aria-label={`Copy full actor ID ${r.actor_id}`}
                    onClick={() => void copyId(r.actor_id)}
                  >
                    {copiedValue === r.actor_id ? "Copied" : "Copy"}
                  </button>
                </td>
                <td>{r.action}</td>
                <td>
                  {entityHrefByType[r.entity_type as keyof typeof entityHrefByType] ? (
                    <Link
                      className="link link-primary"
                      to={entityHrefByType[r.entity_type as keyof typeof entityHrefByType](r.entity_id)}
                      aria-label={`Open ${r.entity_type} ${r.entity_id}`}
                    >
                      {r.entity_type} / {truncateId(r.entity_id)}
                    </Link>
                  ) : (
                    <span>
                      {r.entity_type} / {truncateId(r.entity_id)}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs ml-1"
                    aria-label={`Copy full entity ID ${r.entity_id}`}
                    onClick={() => void copyId(r.entity_id)}
                  >
                    {copiedValue === r.entity_id ? "Copied" : "Copy"}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => toggleMetadata(r.id)}
                    aria-expanded={Boolean(expandedRows[r.id])}
                    aria-controls={`audit-metadata-${r.id}`}
                  >
                    {expandedRows[r.id] ? "Hide metadata" : "Show metadata"}
                  </button>
                  {expandedRows[r.id] && (
                    <pre id={`audit-metadata-${r.id}`} className="mt-1 max-w-md overflow-x-auto text-xs">
                      {Object.keys(r.metadata).length > 0
                        ? JSON.stringify(r.metadata, null, 2)
                        : "No metadata"}
                    </pre>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-sm opacity-70">No events.</p>}
      </div>
      <TablePagination
        page={page}
        hasNextPage={hasNextPage}
        onPageChange={setPage}
        pageSize={AUDIT_PAGE_SIZE}
        visibleCount={rows.length}
        itemLabel="events"
      />
    </div>
  );
};
