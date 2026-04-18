import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { IndustryMultiSelect } from "../components/IndustryMultiSelect";
import { api } from "../api";
import { Application, Company, CompanyResearchStatus, Industry } from "../types";

const dash = (value: string | null | undefined) => (value && String(value).trim() !== "" ? value : "—");

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

function companyHasStoredEnrichment(c: Company): boolean {
  return (
    Boolean(c.overview?.trim()) ||
    Boolean(c.full_overview?.trim()) ||
    (c.analysis_links?.length ?? 0) > 0 ||
    (c.enrichment_source_links?.length ?? 0) > 0
  );
}

export const CompanyDetailPage = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [employeeCountText, setEmployeeCountText] = useState("");
  const [workMode, setWorkMode] = useState("");
  const [workModeDescription, setWorkModeDescription] = useState("");
  const [overview, setOverview] = useState("");
  const [fullOverview, setFullOverview] = useState("");
  const [activelyHiring, setActivelyHiring] = useState<boolean | "">("");
  const [hqLocations, setHqLocations] = useState("");
  const [selectedIndustryIds, setSelectedIndustryIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const industryNameById = useMemo(() => {
    const m: Record<string, string> = {};
    industries.forEach((i) => {
      m[i.id] = i.name;
    });
    return m;
  }, [industries]);

  const load = async () => {
    if (!companyId) return;
    setError(null);
    try {
      const industryParams = new URLSearchParams();
      industryParams.set("skip", "0");
      // API default limit is 100; companies may reference any industry ID — load full taxonomy.
      industryParams.set("limit", "10000");

      const [co, apps, inds] = await Promise.all([
        api.getCompany(companyId),
        api.listApplications(new URLSearchParams({ company_id: companyId })),
        api.listIndustries(industryParams)
      ]);
      setCompany(co);
      setApplications(apps);
      setIndustries(inds);
      setName(co.name);
      setWebsite(co.website ?? "");
      setLinkedin(co.linkedin ?? "");
      setEmployeeCountText(co.employee_count_text ?? "");
      setWorkMode(co.work_mode ?? "");
      setWorkModeDescription(co.work_mode_description ?? "");
      setOverview(co.overview ?? "");
      setFullOverview(co.full_overview ?? "");
      setActivelyHiring(co.actively_hiring === null || co.actively_hiring === undefined ? "" : co.actively_hiring);
      setHqLocations((co.hq_locations ?? []).join(", "));
      setSelectedIndustryIds([...(co.industry_ids ?? [])]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, [companyId]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!companyId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        website: website.trim() || null,
        linkedin: linkedin.trim() || null,
        employee_count_text: employeeCountText.trim() || null,
        work_mode: workMode.trim() || null,
        work_mode_description: workModeDescription.trim() || null,
        overview: overview.trim() || null,
        full_overview: fullOverview.trim() || null,
        actively_hiring: activelyHiring === "" ? null : activelyHiring,
        hq_locations: hqLocations
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        industry_ids: selectedIndustryIds
      };
      const updated = await api.updateCompany(companyId, payload);
      setCompany(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!companyId || !company) return;
    if (!window.confirm(`Delete company “${company.name}”? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.deleteCompany(companyId);
      navigate("/companies");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!companyId) return <div>Missing company id</div>;

  const showIndexedResearchSummary = company?.research_status === "indexed";

  return (
    <div className="space-y-4">
      <div className="breadcrumbs text-sm">
        <ul>
          <li>
            <Link to="/companies">Companies</Link>
          </li>
          <li>{company?.name ?? "Company"}</li>
        </ul>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {!company && !error && <span className="loading loading-spinner" />}
      {company && (
        <>
          <div className="card bg-base-100 p-4 shadow">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-xl font-semibold">{company.name}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {showIndexedResearchSummary && company.full_overview?.trim() ? (
                  <a
                    href={company.full_overview}
                    className="link link-primary text-sm font-medium"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Full Company Detail
                  </a>
                ) : null}
                <button
                  type="button"
                  className="btn btn-outline btn-warning btn-sm"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Set research status to Pending? Overview and enrichment stay saved (Edit company); the indexed summary above will hide until research is indexed again."
                      )
                    ) {
                      return;
                    }
                    setError(null);
                    try {
                      const updated = await api.clearCompanyResearchDetail(companyId);
                      setCompany(updated);
                      setOverview(updated.overview ?? "");
                      setFullOverview(updated.full_overview ?? "");
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-70">
              <span>Research status:</span>
              <span className={`badge badge-sm ${researchBadgeClass(company.research_status)}`}>
                {researchLabel(company.research_status)}
              </span>
            </p>
            <p className="text-sm opacity-70">
              Updated {new Date(company.updated_at).toLocaleString()} · ID{" "}
              <span className="font-mono text-xs">{company.id}</span>
            </p>
            {showIndexedResearchSummary && company.overview?.trim() ? (
              <div className="mt-4">
                <h3 className="text-sm font-semibold opacity-80">Overview</h3>
                <p className="whitespace-pre-wrap text-sm">{company.overview}</p>
              </div>
            ) : null}
            {!showIndexedResearchSummary && companyHasStoredEnrichment(company) ? (
              <p className="mt-4 text-sm opacity-70">
                Overview and agent enrichment are hidden while research status is not Indexed. Values remain in{" "}
                <strong>Edit company</strong> below.
              </p>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold opacity-80">Website</h3>
                {company.website ? (
                  <a href={company.website} className="link link-primary break-all" target="_blank" rel="noreferrer">
                    {company.website}
                  </a>
                ) : (
                  <p className="text-sm">—</p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold opacity-80">LinkedIn</h3>
                {company.linkedin ? (
                  <a href={company.linkedin} className="link link-primary break-all" target="_blank" rel="noreferrer">
                    {company.linkedin}
                  </a>
                ) : (
                  <p className="text-sm">—</p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold opacity-80">Employee count</h3>
                <p className="text-sm">{dash(company.employee_count_text)}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold opacity-80">Work mode</h3>
                <p className="text-sm">{dash(company.work_mode)}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold opacity-80">Actively hiring</h3>
                <p className="text-sm">
                  {company.actively_hiring === null || company.actively_hiring === undefined
                    ? "—"
                    : company.actively_hiring
                      ? "Yes"
                      : "No"}
                </p>
              </div>
              <div className="sm:col-span-2">
                <h3 className="text-sm font-semibold opacity-80">HQ locations</h3>
                <p className="text-sm">
                  {company.hq_locations && company.hq_locations.length > 0
                    ? company.hq_locations.join(", ")
                    : "—"}
                </p>
              </div>
              <div className="sm:col-span-2">
                <h3 className="text-sm font-semibold opacity-80">Industries</h3>
                <p className="text-sm">
                  {company.industry_ids && company.industry_ids.length > 0
                    ? company.industry_ids
                        .map((id) => industryNameById[id] ?? "Unknown industry")
                        .join(", ")
                    : "—"}
                </p>
              </div>
              {company.work_mode_description && (
                <div className="sm:col-span-2">
                  <h3 className="text-sm font-semibold opacity-80">Work mode detail</h3>
                  <p className="whitespace-pre-wrap text-sm">{company.work_mode_description}</p>
                </div>
              )}
            </div>
            {showIndexedResearchSummary && company.analysis_links && company.analysis_links.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold opacity-80">Analysis links</h3>
                <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
                  {company.analysis_links.map((row, idx) => (
                    <li key={`${row.topic}-${idx}`}>
                      <span className="font-medium">{row.topic}: </span>
                      <a href={row.link} className="link link-secondary break-all" target="_blank" rel="noreferrer">
                        {row.link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {showIndexedResearchSummary &&
              company.enrichment_source_links &&
              company.enrichment_source_links.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold opacity-80">Enrichment sources</h3>
                  <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
                    {company.enrichment_source_links.map((url, idx) => (
                      <li key={`${url}-${idx}`}>
                        <a href={url} className="link link-accent break-all" target="_blank" rel="noreferrer">
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </div>

          <div className="card bg-base-100 p-4 shadow">
            <h3 className="mb-2 text-lg font-semibold">Applications</h3>
            {applications.length === 0 ? (
              <p className="text-sm opacity-70">No applications for this company yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-base-300">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Applied</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((a) => (
                      <tr key={a.id}>
                        <td>{a.status}</td>
                        <td className="whitespace-nowrap text-xs">{a.applied_at ?? "—"}</td>
                        <td>
                          <Link to={`/applications/${a.id}`} className="btn btn-ghost btn-xs">
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card bg-base-100 p-4 shadow">
            <h3 className="mb-2 text-lg font-semibold">Edit company</h3>
            <form className="space-y-3" onSubmit={onSubmit}>
              <label className="form-control w-full">
                <span className="label-text">Name</span>
                <input
                  className="input input-bordered w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label className="form-control w-full">
                <span className="label-text">Website</span>
                <input
                  className="input input-bordered w-full"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label className="form-control w-full">
                <span className="label-text">LinkedIn</span>
                <input
                  className="input input-bordered w-full"
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                />
              </label>
              <label className="form-control w-full">
                <span className="label-text">Employee count (text)</span>
                <input
                  className="input input-bordered w-full"
                  value={employeeCountText}
                  onChange={(e) => setEmployeeCountText(e.target.value)}
                />
              </label>
              <label className="form-control w-full">
                <span className="label-text">Work mode</span>
                <select
                  className="select select-bordered w-full"
                  value={workMode}
                  onChange={(e) => setWorkMode(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="onsite">onsite</option>
                  <option value="hybrid">hybrid</option>
                  <option value="remote_us">remote_us</option>
                  <option value="remote_eu">remote_eu</option>
                  <option value="remote_global">remote_global</option>
                  <option value="other">other</option>
                </select>
              </label>
              <label className="form-control w-full">
                <span className="label-text">Work mode description</span>
                <textarea
                  className="textarea textarea-bordered min-h-[80px] w-full"
                  value={workModeDescription}
                  onChange={(e) => setWorkModeDescription(e.target.value)}
                />
              </label>
              <label className="form-control w-full">
                <span className="label-text">Actively hiring</span>
                <select
                  className="select select-bordered w-full"
                  value={activelyHiring === "" ? "" : activelyHiring ? "yes" : "no"}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") setActivelyHiring("");
                    else setActivelyHiring(v === "yes");
                  }}
                >
                  <option value="">—</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className="form-control w-full">
                <span className="label-text">HQ locations (comma-separated)</span>
                <input
                  className="input input-bordered w-full"
                  value={hqLocations}
                  onChange={(e) => setHqLocations(e.target.value)}
                  placeholder="e.g. Austin, Remote"
                />
              </label>
              <div className="form-control w-full">
                <span className="label-text">Industries</span>
                <IndustryMultiSelect
                  industries={industries}
                  value={selectedIndustryIds}
                  onChange={setSelectedIndustryIds}
                  disabled={saving}
                />
              </div>
              <label className="form-control w-full">
                <span className="label-text">Overview</span>
                <textarea
                  className="textarea textarea-bordered min-h-[120px] w-full"
                  value={overview}
                  onChange={(e) => setOverview(e.target.value)}
                />
              </label>
              <label className="form-control w-full">
                <span className="label-text">Full company detail link</span>
                <input
                  className="input input-bordered w-full"
                  value={fullOverview}
                  onChange={(e) => setFullOverview(e.target.value)}
                  placeholder="https://drive.google.com/..."
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button type="button" className="btn btn-outline btn-error" onClick={() => void onDelete()}>
                  Delete company
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
