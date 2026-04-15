import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Modal } from "../components/Modal";
import { api } from "../api";
import { Company } from "../types";

export const CompaniesPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => setItems(await api.listCompanies());
  useEffect(() => {
    void load();
  }, []);

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
          <h2 className="text-xl font-semibold">Companies</h2>
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
                <th>Website</th>
                <th className="whitespace-nowrap">Updated</th>
                <th className="w-24 text-right">Actions</th>
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
                  <td className="max-w-[200px] truncate text-xs opacity-80" title={company.website ?? undefined}>
                    {company.website ?? "—"}
                  </td>
                  <td className="whitespace-nowrap text-xs opacity-80">
                    {new Date(company.updated_at).toLocaleString()}
                  </td>
                  <td className="text-right">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <p className="p-4 text-sm opacity-70">No companies yet.</p>}
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
    </div>
  );
};
