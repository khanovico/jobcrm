import { FormEvent, useEffect, useState } from "react";

import { api } from "../api";
import { Company } from "../types";

export const CompaniesPage = () => {
  const [items, setItems] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [selected, setSelected] = useState<Company | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => setItems(await api.listCompanies());
  useEffect(() => {
    void load();
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (selected) {
        await api.updateCompany(selected.id, { name, website });
      } else {
        await api.createCompany({ name, website });
      }
      setSelected(null);
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
        <h2 className="mb-2 text-xl font-semibold">Companies</h2>
        <ul className="space-y-2">
          {items.map((company) => (
            <li key={company.id} className="flex items-center justify-between rounded border p-2">
              <div>
                <div className="font-medium">{company.name}</div>
                <div className="text-xs">{company.website}</div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-xs"
                  onClick={() => {
                    setSelected(company);
                    setName(company.name);
                    setWebsite(company.website ?? "");
                  }}
                >
                  Edit
                </button>
                <button
                  className="btn btn-xs btn-error"
                  onClick={async () => {
                    await api.deleteCompany(company.id);
                    await load();
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="card bg-base-100 p-4 shadow">
        <h2 className="mb-2 text-xl font-semibold">{selected ? "Edit Company" : "New Company"}</h2>
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
          <button className="btn btn-primary">{selected ? "Update" : "Create"}</button>
        </form>
      </section>
    </div>
  );
};
