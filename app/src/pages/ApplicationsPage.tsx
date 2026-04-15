import { FormEvent, useEffect, useState } from "react";

import { api } from "../api";
import { Application, ApplicationStatus, Company } from "../types";

const statuses: ApplicationStatus[] = [
  "draft",
  "pending_preparation",
  "researching",
  "analysis_ready",
  "preparation_ready",
  "applied",
  "archived"
];

export const ApplicationsPage = () => {
  const [items, setItems] = useState<Application[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>("draft");
  const [selected, setSelected] = useState<Application | null>(null);

  const load = async () => {
    const [applicationItems, companyItems] = await Promise.all([
      api.listApplications(),
      api.listCompanies()
    ]);
    setItems(applicationItems);
    setCompanies(companyItems);
    if (!companyId && companyItems[0]) setCompanyId(companyItems[0].id);
  };

  useEffect(() => {
    void load();
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (selected) {
      await api.updateApplication(selected.id, { status });
    } else {
      await api.createApplication({ company_id: companyId, status });
    }
    setSelected(null);
    await load();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card bg-base-100 p-4 shadow">
        <h2 className="mb-2 text-xl font-semibold">Applications</h2>
        <ul className="space-y-2">
          {items.map((application) => (
            <li key={application.id} className="rounded border p-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{application.status}</div>
                  <div className="text-xs">Applied At: {application.applied_at ?? "-"}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-xs"
                    onClick={() => {
                      setSelected(application);
                      setCompanyId(application.company_id);
                      setStatus(application.status);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-xs btn-success"
                    onClick={async () => {
                      await api.markApplied(application.id, true);
                      await load();
                    }}
                  >
                    Mark Applied
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="card bg-base-100 p-4 shadow">
        <h2 className="mb-2 text-xl font-semibold">
          {selected ? "Edit Application" : "New Application"}
        </h2>
        <form className="space-y-2" onSubmit={onSubmit}>
          <select
            className="select select-bordered w-full"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            required
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <select
            className="select select-bordered w-full"
            value={status}
            onChange={(event) => setStatus(event.target.value as ApplicationStatus)}
          >
            {statuses.map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {statusOption}
              </option>
            ))}
          </select>
          <button className="btn btn-primary">{selected ? "Update" : "Create"}</button>
        </form>
      </section>
    </div>
  );
};
