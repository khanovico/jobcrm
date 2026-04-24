import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApplicationWorkflowOverrideModal } from "../components/ApplicationWorkflowOverrideModal";
import { ClearCompanyResearchModal } from "../components/ClearCompanyResearchModal";
import { ArchiveCompanyModal } from "../components/ArchiveCompanyModal";
import { IndustryMultiSelect } from "../components/IndustryMultiSelect";
import { TablePagination } from "../components/TablePagination";
import { api } from "../api";
import {
  applicationStatusBadgeClass,
  formatApplicationStatusLabel
} from "../applicationStatus";
import { getAllIndustries } from "../state/industryCatalog";
import { invalidateCompanySummariesCache } from "../state/companySummaries";
import { Application, Company, CompanyResearchStatus, Industry } from "../types";

const COMPANY_APPLICATIONS_PAGE_SIZE = 20;

const dash = (value: string | null | undefined) => (value && String(value).trim() !== "" ? value : "—");

const researchLabel = (s: CompanyResearchStatus | undefined) => {
  if (s === "indexed") return "Indexed";
  if (s === "indexing") return "Indexing";
  if (s === "invalid") return "Invalid";
  return "Pending";
};

const researchBadgeClass = (s: CompanyResearchStatus | undefined) => {
  if (s === "indexed") return "badge-success";
  if (s === "indexing") return "badge-info";
  if (s === "invalid") return "badge-error";
  return "badge-warning";
};

function companyHasStoredEnrichment(c: Company): boolean {
  return (
    Boolean(c.overview?.trim()) ||
    Boolean(c.full_product_detail?.trim()) ||
    Boolean(c.full_hiring_detail?.trim()) ||
    Boolean(c.full_organization_detail?.trim()) ||
    (c.analysis_links?.length ?? 0) > 0 ||
    (c.enrichment_source_links?.length ?? 0) > 0
  );
}

export const CompanyDetailPage = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [applicationsPage, setApplicationsPage] = useState(1);
  const [hasNextApplicationsPage, setHasNextApplicationsPage] = useState(false);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [employeeCountText, setEmployeeCountText] = useState("");
  const [workMode, setWorkMode] = useState("");
  const [workModeDescription, setWorkModeDescription] = useState("");
  const [overview, setOverview] = useState("");
  const [fullProductDetail, setFullProductDetail] = useState("");
  const [fullHiringDetail, setFullHiringDetail] = useState("");
  const [fullOrganizationDetail, setFullOrganizationDetail] = useState("");
  const [activelyHiring, setActivelyHiring] = useState<boolean | "">("");
  const [hqLocations, setHqLocations] = useState("");
  const [selectedIndustryIds, setSelectedIndustryIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [clearResearchOpen, setClearResearchOpen] = useState(false);
  const [statusOverrideApplication, setStatusOverrideApplication] = useState<Application | null>(null);

  const industryNameById = useMemo(() => {
    const m: Record<string, string> = {};
    industries.forEach((i) => {
      m[i.id] = i.name;
    });
    return m;
  }, [industries]);

  const loadCompanyContext = useCallback(async () => {
    if (!companyId) return;
    setError(null);
    try {
      const [co, inds] = await Promise.all([api.getCompany(companyId), getAllIndustries()]);
      setCompany(co);
      setIndustries(inds);
      setName(co.name);
      setWebsite(co.website ?? "");
      setLinkedin(co.linkedin ?? "");
      setEmployeeCountText(co.employee_count_text ?? "");
      setWorkMode(co.work_mode ?? "");
      setWorkModeDescription(co.work_mode_description ?? "");
      setOverview(co.overview ?? "");
      setFullProductDetail(co.full_product_detail ?? "");
      setFullHiringDetail(co.full_hiring_detail ?? "");
      setFullOrganizationDetail(co.full_organization_detail ?? "");
      setActivelyHiring(co.actively_hiring === null || co.actively_hiring === undefined ? "" : co.actively_hiring);
      setHqLocations((co.hq_locations ?? []).join(", "));
      setSelectedIndustryIds([...(co.industry_ids ?? [])]);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [companyId]);

  const loadApplicationsPage = useCallback(
    async (targetPage = applicationsPage) => {
      if (!companyId) return;
      setError(null);
      try {
        const params = new URLSearchParams({
          company_id: companyId,
          skip: String((targetPage - 1) * COMPANY_APPLICATIONS_PAGE_SIZE),
          limit: String(COMPANY_APPLICATIONS_PAGE_SIZE)
        });
        const apps = await api.listApplications(params);
        setApplications(apps);
        setHasNextApplicationsPage(apps.length === COMPANY_APPLICATIONS_PAGE_SIZE);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [applicationsPage, companyId]
  );

  useEffect(() => {
    void loadCompanyContext();
  }, [loadCompanyContext]);

  useEffect(() => {
    setApplicationsPage(1);
  }, [companyId]);

  useEffect(() => {
    void loadApplicationsPage(applicationsPage);
  }, [applicationsPage, loadApplicationsPage]);

  useEffect(() => {
    if (applications.length === 0 && applicationsPage > 1) {
      setApplicationsPage((current) => Math.max(1, current - 1));
    }
  }, [applications.length, applicationsPage]);

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
        full_product_detail: fullProductDetail.trim() || null,
        full_hiring_detail: fullHiringDetail.trim() || null,
        full_organization_detail: fullOrganizationDetail.trim() || null,
        actively_hiring: activelyHiring === "" ? null : activelyHiring,
        hq_locations: hqLocations
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        industry_ids: selectedIndustryIds
      };
      const updated = await api.updateCompany(companyId, payload);
      invalidateCompanySummariesCache();
      setCompany(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
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
          {company.archived ? (
            <div className="alert alert-warning text-sm">
              <span>
                This company is archived{company.archive_reason ? `: ${company.archive_reason}` : ""}. It is hidden from
                the main company list; you can still open this page and linked applications.
              </span>
            </div>
          ) : null}
          <div className="card bg-base-100 p-4 shadow">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-xl font-semibold">{company.name}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {showIndexedResearchSummary && company.full_product_detail?.trim() ? (
                  <a
                    href={company.full_product_detail}
                    className="link link-primary text-sm font-medium"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Full Product Detail
                  </a>
                ) : null}
                {showIndexedResearchSummary && company.full_hiring_detail?.trim() ? (
                  <a
                    href={company.full_hiring_detail}
                    className="link link-primary text-sm font-medium"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Full Hiring Detail
                  </a>
                ) : null}
                {showIndexedResearchSummary && company.full_organization_detail?.trim() ? (
                  <a
                    href={company.full_organization_detail}
                    className="link link-primary text-sm font-medium"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Full Organization Detail
                  </a>
                ) : null}
                <button
                  type="button"
                  className="btn btn-outline btn-warning btn-sm"
                  onClick={() => {
                    setError(null);
                    setClearResearchOpen(true);
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
              <>
                <div className="overflow-x-auto rounded-lg border border-base-300">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Applied</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <span className={`badge badge-sm ${applicationStatusBadgeClass(a.status)}`}>
                              {formatApplicationStatusLabel(a.status)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap text-xs">{a.applied_at ?? "—"}</td>
                          <td className="text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() => setStatusOverrideApplication(a)}
                              >
                                Set status…
                              </button>
                              {a.status !== "archived" && (
                                <>
                                  <button
                                    type="button"
                                    className={`btn btn-xs ${a.applied ? "btn-outline" : "btn-success"}`}
                                    disabled={!a.applied && a.status !== "application_ready"}
                                    title={
                                      !a.applied && a.status !== "application_ready"
                                        ? "Use Force mark below when workflow rules block marking applied."
                                        : undefined
                                    }
                                    onClick={async () => {
                                      try {
                                        await api.markApplied(a.id, !a.applied);
                                        await loadApplicationsPage(applicationsPage);
                                      } catch (e) {
                                        setError((e as Error).message);
                                      }
                                    }}
                                  >
                                    {a.applied ? "Unmark" : "Mark applied"}
                                  </button>
                                  {!a.applied ? (
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-xs"
                                      title="Mark applied ignoring workflow (use when correcting data)"
                                      onClick={async () => {
                                        try {
                                          await api.markApplied(a.id, true, { force: true });
                                          await loadApplicationsPage(applicationsPage);
                                        } catch (e) {
                                          setError((e as Error).message);
                                        }
                                      }}
                                    >
                                      Force mark
                                    </button>
                                  ) : null}
                                </>
                              )}
                              <Link to={`/applications/${a.id}`} className="btn btn-primary btn-outline btn-xs">
                                Open detail
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  page={applicationsPage}
                  hasNextPage={hasNextApplicationsPage}
                  onPageChange={setApplicationsPage}
                />
              </>
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
                <span className="label-text">Full product detail link</span>
                <input
                  className="input input-bordered w-full"
                  value={fullProductDetail}
                  onChange={(e) => setFullProductDetail(e.target.value)}
                  placeholder="https://drive.google.com/..."
                />
              </label>
              <label className="form-control w-full">
                <span className="label-text">Full hiring detail link</span>
                <input
                  className="input input-bordered w-full"
                  value={fullHiringDetail}
                  onChange={(e) => setFullHiringDetail(e.target.value)}
                  placeholder="https://drive.google.com/..."
                />
              </label>
              <label className="form-control w-full">
                <span className="label-text">Full organization detail link</span>
                <input
                  className="input input-bordered w-full"
                  value={fullOrganizationDetail}
                  onChange={(e) => setFullOrganizationDetail(e.target.value)}
                  placeholder="https://drive.google.com/..."
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-warning"
                  onClick={() => setArchiveOpen(true)}
                  disabled={!!company.archived}
                >
                  Archive company
                </button>
              </div>
            </form>
          </div>

          <ArchiveCompanyModal
            open={archiveOpen}
            onClose={() => setArchiveOpen(false)}
            company={company ? { id: company.id, name: company.name } : null}
            onArchived={() => navigate("/companies")}
          />

          <ApplicationWorkflowOverrideModal
            open={statusOverrideApplication !== null}
            onClose={() => setStatusOverrideApplication(null)}
            application={statusOverrideApplication}
            onSaved={async () => {
              await loadApplicationsPage(applicationsPage);
            }}
          />

          <ClearCompanyResearchModal
            open={clearResearchOpen}
            onClose={() => setClearResearchOpen(false)}
            company={company ? { id: company.id, name: company.name } : null}
            onCleared={async () => {
              setError(null);
              try {
                setApplicationsPage(1);
                await Promise.all([loadCompanyContext(), loadApplicationsPage(1)]);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </>
      )}
    </div>
  );
};
