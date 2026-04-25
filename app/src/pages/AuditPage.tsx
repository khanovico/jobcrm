import { useCallback, useEffect, useState } from "react";

import { api } from "../api";
import { TablePagination } from "../components/TablePagination";
import { AuditEvent } from "../types";

const AUDIT_PAGE_SIZE = 50;

export const AuditPage = () => {
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [actor, setActor] = useState<"" | "user" | "agent">("");
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage = page) => {
      setError(null);
      try {
        const params = new URLSearchParams();
        if (actor) params.set("actor_type", actor);
        params.set("skip", String((targetPage - 1) * AUDIT_PAGE_SIZE));
        params.set("limit", String(AUDIT_PAGE_SIZE + 1));
        const nextRows = await api.listAuditEvents(params);
        setRows(nextRows.slice(0, AUDIT_PAGE_SIZE));
        setHasNextPage(nextRows.length > AUDIT_PAGE_SIZE);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [actor, page]
  );

  useEffect(() => {
    setPage(1);
  }, [actor]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  useEffect(() => {
    if (rows.length === 0 && page > 1) {
      setPage((current) => Math.max(1, current - 1));
    }
  }, [rows.length, page]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Audit trail</h2>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">Actor</span>
        <select
          className="select select-bordered select-sm"
          value={actor}
          onChange={(e) => setActor(e.target.value as typeof actor)}
        >
          <option value="">All</option>
          <option value="user">User</option>
          <option value="agent">Agent</option>
        </select>
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
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td>
                  <span className="badge badge-ghost badge-sm">{r.actor_type}</span>
                  <span className="ml-1 font-mono text-xs opacity-70">{r.actor_id.slice(0, 8)}…</span>
                </td>
                <td>{r.action}</td>
                <td>
                  {r.entity_type} / {r.entity_id.slice(0, 8)}…
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
