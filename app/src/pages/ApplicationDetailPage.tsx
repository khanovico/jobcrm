import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../api";
import { Application, Company, Email, PerProfileApplication, Profile } from "../types";

export const ApplicationDetailPage = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const [application, setApplication] = useState<Application | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [ppas, setPpas] = useState<PerProfileApplication[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [emailsByPpa, setEmailsByPpa] = useState<Record<string, Email[]>>({});
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!applicationId) return;
    setError(null);
    try {
      const app = await api.getApplication(applicationId);
      setApplication(app);
      const co = await api.getCompany(app.company_id);
      setCompany(co);
      const list = await api.listPerProfileApplications(applicationId);
      setPpas(list);
      const profs = await api.listProfiles();
      const map: Record<string, Profile> = {};
      profs.forEach((p) => {
        map[p.id] = p;
      });
      setProfiles(map);
      const em: Record<string, Email[]> = {};
      for (const p of list) {
        em[p.id] = await api.listEmailsForPpa(p.id);
      }
      setEmailsByPpa(em);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, [applicationId]);

  if (!applicationId) return <div>Missing id</div>;

  return (
    <div className="space-y-4">
      <div className="breadcrumbs text-sm">
        <ul>
          <li>
            <Link to="/applications">Applications</Link>
          </li>
          <li>Detail</li>
        </ul>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {!application && !error && <span className="loading loading-spinner" />}
      {application && (
        <>
          <div className="card bg-base-100 p-4 shadow">
            <h2 className="text-xl font-semibold">Application</h2>
            <p className="text-sm opacity-80">Company: {company?.name ?? application.company_id}</p>
            <p className="text-sm">Status: {application.status}</p>
            <p className="text-sm">Applied: {application.applied_at ?? "—"}</p>
            <p className="text-sm">Email sent (tracker): {application.email_sent_at ?? "—"}</p>
            {application.job_post?.job_link && (
              <a
                href={application.job_post.job_link}
                className="link link-primary text-sm"
                target="_blank"
                rel="noreferrer"
              >
                Job link
              </a>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={async () => {
                  await api.markApplied(application.id, true);
                  await load();
                }}
              >
                Mark applied
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={async () => {
                  await api.markApplicationEmailSent(application.id, true);
                  await load();
                }}
              >
                Mark email sent
              </button>
            </div>
          </div>

          <div className="card bg-base-100 p-4 shadow">
            <h3 className="mb-2 text-lg font-semibold">Per-profile analysis (ordered)</h3>
            <div className="space-y-4">
              {ppas.map((ppa) => (
                <div key={ppa.id} className="rounded-lg border border-base-300 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      #{ppa.order_index} — {profiles[ppa.profile_id]?.name ?? ppa.profile_id}
                    </span>
                    {ppa.fit_score != null && (
                      <span className="badge badge-ghost">Fit {ppa.fit_score}</span>
                    )}
                  </div>
                  {ppa.tailored_resume_link && (
                    <a
                      href={ppa.tailored_resume_link}
                      className="link link-secondary text-sm"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Tailored resume
                    </a>
                  )}
                  <p className="mt-2 whitespace-pre-wrap text-sm">{ppa.analysis || "—"}</p>
                  <div className="mt-2">
                    <h4 className="text-sm font-semibold">Emails</h4>
                    <ul className="space-y-2">
                      {(emailsByPpa[ppa.id] ?? []).map((em) => (
                        <li key={em.id} className="rounded bg-base-200 p-2 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="badge badge-outline">{em.kind}</span>
                            <span className="text-xs opacity-70">
                              Sent: {em.sent_at ?? "—"}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap">{em.content}</p>
                          {!em.sent && (
                            <button
                              type="button"
                              className="btn btn-xs btn-primary mt-2"
                              onClick={async () => {
                                await api.markEmailSent(em.id);
                                await load();
                              }}
                            >
                              Mark email sent
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
              {ppas.length === 0 && <p className="text-sm opacity-70">No per-profile rows yet.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
