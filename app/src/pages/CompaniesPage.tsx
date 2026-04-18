import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { NewApplicationModal } from "../components/NewApplicationModal";
import { Modal } from "../components/Modal";
import { api } from "../api";
import { Company, CompanyResearchStatus, WorkerStateResponse } from "../types";

const PAGE_SIZE = 10;

const researchLabel = (s: CompanyResearchStatus | undefined) => {
  if (s === "indexed") return "Indexed";
  if (s === "indexing") return "Indexing";
  return "Pending";
};

const researchBadgeClass = (s: CompanyResearchStatus | undefined) => {
  if (s === "indexed") return "badge-success";
  if (s === "indexing") return "badge-info";
  return "badge-warning";
};

export const CompaniesPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [applyCompanyId, setApplyCompanyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workerState, setWorkerState] = useState<WorkerStateResponse | null>(null);

  const load = async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const [response, workers] = await Promise.all([
        api.listCompanies(
          new URLSearchParams({
            skip: String((targetPage - 1) * PAGE_SIZE),
            limit: String(PAGE_SIZE)
          })
        ),
        api.getWorkerState().catch(() => null)
      ]);
      setItems(response);
      setHasNextPage(response.length === PAGE_SIZE);
      setWorkerState(workers);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load(page);
  }, [page]);

  useEffect(() => {
    if (items.length === 0 && page > 1) {
      setPage((current) => Math.max(1, current - 1));
    }
  }, [items.length, page]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await api.createCompany({ name, website: website.trim() || null });
      setName("");
      setWebsite("");
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <section className="card bg-base-100 p-4 shadow">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">Companies</h2>
            {workerState?.max ? (
              <p className="mt-1 text-xs opacity-70">
                {(workerState.max.company_researcher ?? 0) > 0
                  ? `${workerState.active.company_researcher ?? 0}/${workerState.max.company_researcher} Researchers are running`
                  : "No current active worker"}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
              Refresh
            </button>
            <button
              type="button"
              className="btn btn-circle btn-primary btn-sm"
              title="New company"
              aria-label="New company"
              onClick={() => {
                setError(null);
                setCreateOpen(true);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-base-300">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th className="whitespace-nowrap">Research</th>
                <th>Website</th>
                <th className="whitespace-nowrap">Updated</th>
                <th className="min-w-[140px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((company) => (
                <tr
                  key={company.id}
                  className="cursor-pointer hover:bg-base-200"
                  onClick={() => navigate(`/companies/${company.id}`)}
                >
                  <td className="font-medium">{company.name}</td>
                  <td>
                    <span className={`badge badge-sm ${researchBadgeClass(company.research_status)}`}>
                      {researchLabel(company.research_status)}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate text-xs opacity-80" title={company.website ?? undefined}>
                    {company.website ?? "—"}
                  </td>
                  <td className="whitespace-nowrap text-xs opacity-80">
                    {new Date(company.updated_at).toLocaleString()}
                  </td>
                  <td className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        className="btn btn-xs btn-primary btn-outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setError(null);
                          setApplyCompanyId(company.id);
                          setApplicationOpen(true);
                        }}
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-error btn-outline"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm(`Delete “${company.name}”?`)) return;
                          await api.deleteCompany(company.id);
                          await load();
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <p className="p-4 text-sm opacity-70">No companies yet.</p>}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs opacity-70">Page {page}</p>
          <div className="join">
            <button
              type="button"
              className="btn btn-xs join-item"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1 || loading}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-xs join-item"
              onClick={() => setPage((current) => current + 1)}
              disabled={!hasNextPage || loading}
            >
              Next
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs opacity-60">Click a row to view and edit full company details.</p>
      </section>

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setError(null);
        }}
        title="New company"
        size="md"
      >
        <form className="space-y-3" onSubmit={onSubmit} aria-label="Create new company">
          <label className="form-control w-full">
            <span className="label-text">Name</span>
            <input
              className="input input-bordered w-full"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus={createOpen}
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text">Website</span>
            <input
              className="input input-bordered w-full"
              placeholder="Website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit">
              Create
            </button>
          </div>
        </form>
      </Modal>

      <NewApplicationModal
        open={applicationOpen}
        onClose={() => {
          setApplicationOpen(false);
          setApplyCompanyId(null);
        }}
        companies={items}
        editing={null}
        initialCompanyId={applyCompanyId}
        onSuccess={async () => {
          await load();
          setApplicationOpen(false);
          setApplyCompanyId(null);
          navigate("/applications");
        }}
      />
    </div>
  );
};
