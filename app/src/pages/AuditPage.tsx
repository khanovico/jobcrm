import { useEffect, useState } from "react";

import { api } from "../api";
import { AuditEvent } from "../types";

export const AuditPage = () => {
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [actor, setActor] = useState<"" | "user" | "agent">("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (actor) params.set("actor_type", actor);
      setRows(await api.listAuditEvents(params));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, [actor]);

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
        <button type="button" className="btn btn-sm" onClick={() => void load()}>
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
    </div>
  );
};
