import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

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
  const [bootstrapName, setBootstrapName] = useState("");
  const [bootstrapWebsite, setBootstrapWebsite] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  const companyNameById = (id: string) => companies.find((c) => c.id === id)?.name ?? id;

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

  const onBootstrap = async (event: FormEvent) => {
    event.preventDefault();
    const payload: Parameters<typeof api.bootstrapApplication>[0] = {
      company_name: bootstrapName.trim()
    };
    if (bootstrapWebsite.trim()) payload.company_website = bootstrapWebsite.trim();
    if (jobLink.trim() || jobDescription.trim()) {
      payload.job_post = {};
      if (jobLink.trim()) payload.job_post!.job_link = jobLink.trim();
      if (jobDescription.trim()) payload.job_post!.job_description = jobDescription.trim();
    }
    await api.bootstrapApplication(payload);
    setBootstrapName("");
    setBootstrapWebsite("");
    setJobLink("");
    setJobDescription("");
    await load();
  };

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <section className="card bg-base-100 p-4 shadow xl:col-span-2">
        <h2 className="mb-2 text-xl font-semibold">Applications</h2>
        <ul className="space-y-2">
          {items.map((application) => (
            <li key={application.id} className="rounded border p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link
                    to={`/applications/${application.id}`}
                    className="link link-hover font-medium"
                  >
                    {companyNameById(application.company_id)}
                  </Link>
                  <div className="text-xs opacity-80">{application.status}</div>
                  <div className="text-xs">Applied: {application.applied_at ?? "—"}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-xs"
                    type="button"
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
                    type="button"
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
      <div className="space-y-4">
        <section className="card bg-base-100 p-4 shadow">
          <h2 className="mb-2 text-xl font-semibold">Quick create (company + pending)</h2>
          <p className="mb-2 text-sm opacity-80">
            Creates a company and an application in <code>pending_preparation</code>.
          </p>
          <form className="space-y-2" onSubmit={onBootstrap}>
            <input
              className="input input-bordered w-full"
              placeholder="Company name *"
              value={bootstrapName}
              onChange={(e) => setBootstrapName(e.target.value)}
              required
            />
            <input
              className="input input-bordered w-full"
              placeholder="Company website (optional)"
              value={bootstrapWebsite}
              onChange={(e) => setBootstrapWebsite(e.target.value)}
            />
            <input
              className="input input-bordered w-full"
              placeholder="Job link (optional)"
              value={jobLink}
              onChange={(e) => setJobLink(e.target.value)}
            />
            <textarea
              className="textarea textarea-bordered w-full text-sm"
              placeholder="Job description (optional)"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={3}
            />
            <button className="btn btn-primary w-full" type="submit">
              Create application
            </button>
          </form>
        </section>
        <section className="card bg-base-100 p-4 shadow">
          <h2 className="mb-2 text-xl font-semibold">
            {selected ? "Edit Application" : "New Application (existing company)"}
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
            <button className="btn btn-primary w-full">{selected ? "Update" : "Create"}</button>
          </form>
        </section>
      </div>
    </div>
  );
};
