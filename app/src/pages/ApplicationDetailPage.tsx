import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import DOMPurify from "dompurify";

import { ArchiveApplicationModal } from "../components/ArchiveApplicationModal";
import { api } from "../api";
import { Application, Company, Email, PerProfileApplication, Profile } from "../types";

const decodeEscapedHtml = (content: string): string => {
  if (!content.includes("&lt;") && !content.includes("&#")) {
    return content;
  }
  const textarea = document.createElement("textarea");
  textarea.innerHTML = content;
  return textarea.value;
};

const sanitizeEmailHtml = (content: string) =>
  DOMPurify.sanitize(decodeEscapedHtml(content), {
    USE_PROFILES: { html: true }
  });

const formatRecipient = (
  recipient: { title?: string; name?: string; email?: string | null } | null | undefined
) => {
  if (!recipient) return null;
  const title = recipient.title?.trim() ?? "";
  const fullName = recipient.name?.trim() ?? "";
  const email = recipient.email?.trim() ?? "";
  if (title && fullName && email) return `${title} - ${fullName} (${email})`;
  if (fullName && email) return `${fullName} (${email})`;
  if (title && fullName) return `${title} - ${fullName}`;
  return fullName || email || title || null;
};

type RecipientDraft = {
  title: string;
  name: string;
  email: string;
};

const getActiveSubject = (
  subjects: string[] | undefined,
  selectedSubjectIndex: number | undefined
): string | null => {
  if (!subjects || subjects.length === 0) return null;
  if (selectedSubjectIndex == null) return null;
  return subjects[selectedSubjectIndex] ?? null;
};

export const ApplicationDetailPage = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const [searchParams] = useSearchParams();
  const focusEmailId = searchParams.get("emailId");
  const [application, setApplication] = useState<Application | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [ppas, setPpas] = useState<PerProfileApplication[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [emailsByPpa, setEmailsByPpa] = useState<Record<string, Email[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [subjectUpdateBusyKey, setSubjectUpdateBusyKey] = useState<string | null>(null);
  const [editingRecipientPpaId, setEditingRecipientPpaId] = useState<string | null>(null);
  const [recipientDraftByPpa, setRecipientDraftByPpa] = useState<Record<string, RecipientDraft>>({});
  const [recipientUpdateBusyPpaId, setRecipientUpdateBusyPpaId] = useState<string | null>(null);

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
      const emailEntries = await Promise.all(
        list.map(async (p) => {
          try {
            const emails = await api.listEmailsForPpa(p.id);
            return [p.id, emails] as const;
          } catch {
            return [p.id, [] as Email[]] as const;
          }
        })
      );
      const em: Record<string, Email[]> = {};
      emailEntries.forEach(([ppaId, emails]) => {
        em[ppaId] = emails;
      });
      setEmailsByPpa(em);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, [applicationId]);

  useEffect(() => {
    if (!focusEmailId) return;
    const el = document.getElementById(`email-${focusEmailId}`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusEmailId, emailsByPpa, applicationId]);

  const updateActiveSubject = async (ppa: PerProfileApplication, nextIndex: number) => {
    const plan = ppa.cold_email_plan;
    if (!plan) return;
    if (nextIndex === plan.selected_subject_index) return;
    const busyKey = `${ppa.id}:${nextIndex}`;
    setSubjectUpdateBusyKey(busyKey);
    const nextPlan = { ...plan, selected_subject_index: nextIndex };
    const prevPpas = ppas;
    setPpas((prev) =>
      prev.map((row) =>
        row.id === ppa.id
          ? {
              ...row,
              cold_email_plan: nextPlan
            }
          : row
      )
    );
    try {
      const updated = await api.updatePerProfileApplication(ppa.id, { cold_email_plan: nextPlan });
      setPpas((prev) => prev.map((row) => (row.id === ppa.id ? updated : row)));
    } catch (e) {
      setPpas(prevPpas);
      setError((e as Error).message);
    } finally {
      setSubjectUpdateBusyKey(null);
    }
  };

  const getRecipientForEmail = (ppa: PerProfileApplication, em: Email) => em.to ?? ppa.cold_email_plan?.to ?? null;

  const startEditRecipient = (ppa: PerProfileApplication, em: Email) => {
    const current = getRecipientForEmail(ppa, em);
    setEditingRecipientPpaId(ppa.id);
    setRecipientDraftByPpa((prev) => ({
      ...prev,
      [ppa.id]: {
        title: current?.title ?? "",
        name: current?.name ?? "",
        email: current?.email ?? ""
      }
    }));
  };

  const cancelEditRecipient = () => {
    setEditingRecipientPpaId(null);
  };

  const saveRecipient = async (ppa: PerProfileApplication) => {
    const draft = recipientDraftByPpa[ppa.id];
    if (!draft) return;
    const basePlan = ppa.cold_email_plan ?? {
      subjects: [],
      selected_subject_index: 0,
      status: "none"
    };
    const normalizedTo = {
      title: draft.title.trim(),
      name: draft.name.trim(),
      email: draft.email.trim() || null
    };
    const nextPlan = {
      ...basePlan,
      to: normalizedTo
    };

    setRecipientUpdateBusyPpaId(ppa.id);
    const prevPpas = ppas;
    setPpas((prev) =>
      prev.map((row) =>
        row.id === ppa.id
          ? {
              ...row,
              cold_email_plan: nextPlan
            }
          : row
      )
    );
    try {
      const updated = await api.updatePerProfileApplication(ppa.id, { cold_email_plan: nextPlan });
      setPpas((prev) => prev.map((row) => (row.id === ppa.id ? updated : row)));
      setEditingRecipientPpaId(null);
    } catch (e) {
      setPpas(prevPpas);
      setError((e as Error).message);
    } finally {
      setRecipientUpdateBusyPpaId(null);
    }
  };

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
            {application.status === "archived" && application.archive_reason && (
              <p className="text-sm text-warning">
                <span className="font-medium">Why archived:</span> {application.archive_reason}
              </p>
            )}
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
            {application.status !== "archived" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`btn btn-sm ${application.applied ? "btn-outline" : "btn-success"}`}
                  onClick={async () => {
                    await api.markApplied(application.id, !application.applied);
                    await load();
                  }}
                >
                  {application.applied ? "Unmark applied" : "Mark applied"}
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${application.email_sent ? "btn-outline" : "btn-primary"}`}
                  onClick={async () => {
                    await api.markApplicationEmailSent(application.id, !application.email_sent);
                    await load();
                  }}
                >
                  {application.email_sent ? "Unmark email sent" : "Mark email sent"}
                </button>
                <button type="button" className="btn btn-warning btn-outline btn-sm" onClick={() => setArchiveOpen(true)}>
                  Archive
                </button>
              </div>
            )}
          </div>

          <div className="card bg-base-100 p-4 shadow">
            <h3 className="mb-2 text-lg font-semibold">Per-profile analysis (ordered)</h3>
            <div className="space-y-4">
              {ppas.map((ppa) => {
                const ppaEmails = emailsByPpa[ppa.id] ?? [];

                return (
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
                        {ppaEmails.map((em) => (
                          <li
                            key={em.id}
                            id={`email-${em.id}`}
                            className={[
                              "rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm",
                              focusEmailId === em.id ? "ring-2 ring-primary ring-offset-2 ring-offset-base-200" : ""
                            ].join(" ")}
                          >
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="badge badge-outline">{em.kind}</span>
                                <span className="badge badge-ghost">{em.lifecycle_status}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {em.sent && em.sent_at && (
                                  <span className="text-xs opacity-70">Sent: {em.sent_at}</span>
                                )}
                                <button
                                  type="button"
                                  className={`btn btn-xs ${em.sent ? "btn-outline" : "btn-primary"}`}
                                  onClick={async () => {
                                    await api.markEmailSent(em.id, !em.sent);
                                    await load();
                                  }}
                                >
                                  {em.sent ? "Unmark email sent" : "Mark email sent"}
                                </button>
                              </div>
                            </div>

                            {ppa.cold_email_plan?.subjects?.length ? (
                              <details className="mb-3 rounded-lg border border-base-300 bg-base-200/40 p-3">
                                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide opacity-70">
                                  Subjects
                                </summary>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {ppa.cold_email_plan.subjects.map((subject, index) => {
                                    const isActive = index === ppa.cold_email_plan?.selected_subject_index;
                                    return (
                                      <button
                                        type="button"
                                        key={`${em.id}-subject-${index}`}
                                        disabled={subjectUpdateBusyKey != null}
                                        className={
                                          isActive
                                            ? "badge badge-primary h-auto min-h-7 whitespace-normal px-3 py-2 text-left"
                                            : "badge badge-outline h-auto min-h-7 whitespace-normal px-3 py-2 text-left hover:badge-primary"
                                        }
                                        onClick={() => {
                                          void updateActiveSubject(ppa, index);
                                        }}
                                      >
                                        {subject}
                                      </button>
                                    );
                                  })}
                                </div>
                              </details>
                            ) : null}

                            {editingRecipientPpaId === ppa.id ? (
                              <div className="mb-3 rounded-lg border border-base-300 bg-base-200/40 p-3">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">To</p>
                                <div className="grid gap-2 sm:grid-cols-3">
                                  <input
                                    type="text"
                                    className="input input-sm input-bordered w-full"
                                    placeholder="Title"
                                    aria-label="Recipient title"
                                    value={recipientDraftByPpa[ppa.id]?.title ?? ""}
                                    onChange={(e) =>
                                      setRecipientDraftByPpa((prev) => ({
                                        ...prev,
                                        [ppa.id]: {
                                          ...(prev[ppa.id] ?? { title: "", name: "", email: "" }),
                                          title: e.target.value
                                        }
                                      }))
                                    }
                                  />
                                  <input
                                    type="text"
                                    className="input input-sm input-bordered w-full"
                                    placeholder="Name"
                                    aria-label="Recipient name"
                                    value={recipientDraftByPpa[ppa.id]?.name ?? ""}
                                    onChange={(e) =>
                                      setRecipientDraftByPpa((prev) => ({
                                        ...prev,
                                        [ppa.id]: {
                                          ...(prev[ppa.id] ?? { title: "", name: "", email: "" }),
                                          name: e.target.value
                                        }
                                      }))
                                    }
                                  />
                                  <input
                                    type="email"
                                    className="input input-sm input-bordered w-full"
                                    placeholder="Email"
                                    aria-label="Recipient email"
                                    value={recipientDraftByPpa[ppa.id]?.email ?? ""}
                                    onChange={(e) =>
                                      setRecipientDraftByPpa((prev) => ({
                                        ...prev,
                                        [ppa.id]: {
                                          ...(prev[ppa.id] ?? { title: "", name: "", email: "" }),
                                          email: e.target.value
                                        }
                                      }))
                                    }
                                  />
                                </div>
                                <div className="mt-2 flex gap-2">
                                  <button
                                    type="button"
                                    className="btn btn-xs btn-primary"
                                    disabled={recipientUpdateBusyPpaId === ppa.id}
                                    onClick={() => {
                                      void saveRecipient(ppa);
                                    }}
                                  >
                                    Save recipient
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-xs btn-ghost"
                                    disabled={recipientUpdateBusyPpaId === ppa.id}
                                    onClick={cancelEditRecipient}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm">
                                  <span className="font-medium opacity-70">To:</span>{" "}
                                  {formatRecipient(getRecipientForEmail(ppa, em)) ?? "—"}
                                </p>
                                <button
                                  type="button"
                                  className="btn btn-xs btn-ghost"
                                  onClick={() => startEditRecipient(ppa, em)}
                                >
                                  Edit recipient
                                </button>
                              </div>
                            )}

                            {getActiveSubject(
                              ppa.cold_email_plan?.subjects,
                              ppa.cold_email_plan?.selected_subject_index
                            ) && (
                              <p className="mb-3 text-sm">
                                <span className="font-medium opacity-70">Subject:</span>{" "}
                                {getActiveSubject(
                                  ppa.cold_email_plan?.subjects,
                                  ppa.cold_email_plan?.selected_subject_index
                                )}
                              </p>
                            )}

                            <div
                              className="prose prose-sm mt-1 max-w-none rounded-lg border border-base-300 bg-base-100 p-3"
                              // Email bodies are generated as HTML; sanitize before rendering.
                              dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(em.content) }}
                            />
                          </li>
                        ))}
                        {ppaEmails.length === 0 && (
                          <li className="rounded-lg border border-dashed border-base-300 bg-base-100 p-4 text-sm opacity-70">
                            No emails yet.
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                );
              })}
              {ppas.length === 0 && <p className="text-sm opacity-70">No per-profile rows yet.</p>}
            </div>
          </div>

          <ArchiveApplicationModal
            open={archiveOpen}
            onClose={() => setArchiveOpen(false)}
            applicationId={application.id}
            companyLabel={company?.name ?? application.company_id}
            onArchived={load}
          />
        </>
      )}
    </div>
  );
};
