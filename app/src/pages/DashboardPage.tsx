import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { DashboardMetrics, GlobalSearchResult } from "../types";

export const DashboardPage = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [q, setQ] = useState("");
  const [searchResult, setSearchResult] = useState<GlobalSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setMetrics(await api.getDashboardMetrics());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const onSearch = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!q.trim()) {
      setSearchResult(null);
      return;
    }
    try {
      setSearchResult(await api.globalSearch(q.trim()));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {error && <div className="alert alert-error text-sm">{error}</div>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="card bg-base-100 p-4 shadow">
          <h3 className="font-semibold">Company research pipeline</h3>
          <p className="text-3xl">{metrics?.company_research_pipeline ?? "—"}</p>
        </div>
        <div className="card bg-base-100 p-4 shadow">
          <h3 className="font-semibold">Application ready</h3>
          <p className="text-3xl">{metrics?.application_ready ?? "—"}</p>
        </div>
        <div className="card bg-base-100 p-4 shadow">
          <h3 className="font-semibold">Actions to review</h3>
          <p className="text-3xl">{metrics?.actions_need_review ?? "—"}</p>
        </div>
        <div className="card bg-base-100 p-4 shadow">
          <h3 className="font-semibold">Unread notifications</h3>
          <p className="text-3xl">{metrics?.unread_notifications ?? "—"}</p>
        </div>
      </div>

      <section className="card bg-base-100 p-4 shadow">
        <h3 className="mb-2 font-semibold">Search</h3>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={onSearch}>
          <input
            className="input input-bordered flex-1"
            placeholder="Companies, profiles, application notes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
        {searchResult && (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <h4 className="font-medium">Companies</h4>
              <ul className="text-sm">
                {searchResult.companies.map((c) => (
                  <li key={c.id}>
                    <Link to={`/companies/${c.id}`} className="link link-primary">
                      {c.name}
                    </Link>
                  </li>
                ))}
                {searchResult.companies.length === 0 && <li className="opacity-60">None</li>}
              </ul>
            </div>
            <div>
              <h4 className="font-medium">Profiles</h4>
              <ul className="text-sm">
                {searchResult.profiles.map((p) => (
                  <li key={p.id}>
                    <Link to={`/profiles/${p.id}`} className="link link-primary">
                      {p.name}
                    </Link>
                  </li>
                ))}
                {searchResult.profiles.length === 0 && <li className="opacity-60">None</li>}
              </ul>
            </div>
            <div>
              <h4 className="font-medium">Applications</h4>
              <ul className="text-sm">
                {searchResult.applications.map((a) => (
                  <li key={a.id}>
                    <Link to={`/applications/${a.id}`} className="link link-primary">
                      {a.status} — {a.id.slice(0, 8)}…
                    </Link>
                  </li>
                ))}
                {searchResult.applications.length === 0 && <li className="opacity-60">None</li>}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
