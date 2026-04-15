import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../api";
import { Company } from "../types";

export const CompaniesPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card bg-base-100 p-4 shadow">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Companies</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
            Refresh
          </button>
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
      <section className="card bg-base-100 p-4 shadow">
        <h2 className="mb-2 text-xl font-semibold">New company</h2>
        <form className="space-y-2" onSubmit={onSubmit}>
          <input
            className="input input-bordered w-full"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="input input-bordered w-full"
            placeholder="Website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          {error && <p className="text-sm text-error">{error}</p>}
          <button className="btn btn-primary" type="submit">
            Create
          </button>
        </form>
      </section>
    </div>
  );
};
