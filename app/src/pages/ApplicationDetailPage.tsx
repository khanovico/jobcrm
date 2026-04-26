import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import DOMPurify from "dompurify";

import { ArchiveApplicationModal } from "../components/ArchiveApplicationModal";
import { ClearApplicationToPendingModal } from "../components/ClearApplicationToPendingModal";
import { DestructiveConfirmModal } from "../components/DestructiveConfirmModal";
import { api } from "../api";
import {
  applicationStatusBadgeClass,
  formatApplicationStatusLabel
} from "../applicationStatus";
import type {
  Application,
  ApplicationStatus,
  Company,
  Email,
  PerProfileApplication,
  PerProfileApplicationDetail
} from "../types";

/** Status after clear/reset for this company’s research state. */
function clearResetTargetStatus(company: Company | null): ApplicationStatus {
  if (!company) return "company_research_pending";
  if (company.research_status === "indexed") return "ppa_pending";
  if (company.research_status === "invalid") return "invalid";
  return "company_research_pending";
}

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

const EmailHtmlContent = memo(({ content }: { content: string }) => {
  const sanitizedHtml = useMemo(() => sanitizeEmailHtml(content), [content]);

  return (
    <div
      className="prose prose-sm mt-1 max-w-none rounded-lg border border-base-300 bg-base-100 p-3"
      // Email bodies are generated as HTML; sanitize before rendering.
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
});

const LazyDetails = ({
  className,
  summaryClassName,
  summary,
  children
}: {
  className: string;
  summaryClassName: string;
  summary: string;
  children: ReactNode;
}) => {
  const [hasOpened, setHasOpened] = useState(false);

  return (
    <details
      className={className}
      onToggle={(event) => {
        if (event.currentTarget.open) setHasOpened(true);
      }}
    >
      <summary className={summaryClassName}>{summary}</summary>
      {hasOpened ? children : null}
    </details>
  );
};

const formatRecipient = (
  recipient: { title?: string; name?: string; email?: string | null; timezone?: string | null } | null | undefined
) => {
  if (!recipient) return null;
  const title = recipient.title?.trim() ?? "";
  const fullName = recipient.name?.trim() ?? "";
  const email = recipient.email?.trim() ?? "";
  const tz = recipient.timezone?.trim() ?? "";
  let line: string | null = null;
  if (title && fullName && email) line = `${title} - ${fullName} (${email})`;
  else if (fullName && email) line = `${fullName} (${email})`;
  else if (title && fullName) line = `${title} - ${fullName}`;
  else line = fullName || email || title || null;
  if (!line) return tz || null;
  if (tz) return `${line} · ${tz}`;
  return line;
};

type RecipientDraft = {
  title: string;
  name: string;
  email: string;
  timezone: string;
};

type ReadinessItem = {
  label: string;
  ready: boolean;
};

type EmailDeleteTarget = {
  ppaId: string;
  profileName: string;
  email: Email;
  recipientLabel: string | null;
};

const getActiveSubject = (
  subjects: string[] | undefined,
  selectedSubjectIndex: number | undefined
): string | null => {
  if (!subjects || subjects.length === 0) return null;
  if (selectedSubjectIndex == null) return null;
  return subjects[selectedSubjectIndex] ?? null;
};

const actionError = (errors: Record<string, string>, key: string) =>
  errors[key] ? (
    <p className="mt-2 text-xs text-error" role="alert">
      {errors[key]}
    </p>
  ) : null;

export const ApplicationDetailPage = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const [searchParams] = useSearchParams();
  const focusEmailId = searchParams.get("emailId");
  const [application, setApplication] = useState<Application | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [ppaDetails, setPpaDetails] = useState<PerProfileApplicationDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [clearToPendingOpen, setClearToPendingOpen] = useState(false);
  const [subjectUpdateBusyKey, setSubjectUpdateBusyKey] = useState<string | null>(null);
  const [editingRecipientPpaId, setEditingRecipientPpaId] = useState<string | null>(null);
  const [recipientDraftByPpa, setRecipientDraftByPpa] = useState<Record<string, RecipientDraft>>({});
  const [recipientUpdateBusyPpaId, setRecipientUpdateBusyPpaId] = useState<string | null>(null);
  const [emailDeleteTarget, setEmailDeleteTarget] = useState<EmailDeleteTarget | null>(null);
  const [actionBusyKeys, setActionBusyKeys] = useState<Set<string>>(() => new Set());
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    if (!applicationId) return;
    setError(null);
    try {
      const detail = await api.getApplicationDetail(applicationId);
      setApplication(detail.application);
      setCompany(detail.company);
      setPpaDetails(detail.per_profile_applications);
      setActionErrors({});
    } catch (e) {
      setError((e as Error).message);
    }
  }, [applicationId]);

  const mergeUpdatedPpa = useCallback((updatedPpa: PerProfileApplication) => {
    setPpaDetails((prev) =>
      prev.map((row) =>
        row.id === updatedPpa.id
          ? {
              ...row,
              ...updatedPpa
            }
          : row
      )
    );
  }, []);

  const allEmails = useMemo(() => ppaDetails.flatMap((ppa) => ppa.emails), [ppaDetails]);
  const sentEmails = useMemo(() => allEmails.filter((email) => email.sent), [allEmails]);
  const recommendedPpa = useMemo(() => {
    return [...ppaDetails].sort((a, b) => {
      const fitA = a.fit_score ?? -1;
      const fitB = b.fit_score ?? -1;
      if (fitA !== fitB) return fitB - fitA;
      return a.order_index - b.order_index;
    })[0];
  }, [ppaDetails]);
  const recommendedRecipient = recommendedPpa?.cold_email_plan?.to ?? null;
  const recommendedSubject = getActiveSubject(
    recommendedPpa?.cold_email_plan?.subjects,
    recommendedPpa?.cold_email_plan?.selected_subject_index
  );
  const readinessItems: ReadinessItem[] = [
    { label: "Per-profile analysis", ready: ppaDetails.length > 0 },
    { label: "Generated email", ready: allEmails.length > 0 },
    { label: "Recipient", ready: Boolean(recommendedRecipient) },
    { label: "Subject", ready: Boolean(recommendedSubject) },
    { label: "Tailored resume", ready: Boolean(recommendedPpa?.tailored_resume_link) }
  ];
  const nextAction = (() => {
    if (!application) return null;
    if (application.status === "company_research_pending") return "Waiting for company research.";
    if (application.status !== "application_ready") return `Current status: ${formatApplicationStatusLabel(application.status)}.`;
    if (!application.applied) return "Review the top profile, then mark applied when submitted.";
    if (!application.email_sent && sentEmails.length === 0) return "Mark the sent email before tracking the application as email sent.";
    if (!application.email_sent) return "Confirm the application email-sent tracker.";
    return "Application is tracked as applied and emailed.";
  })();

  const setActionError = (key: string, message: string) => {
    setActionErrors((prev) => ({ ...prev, [key]: message }));
  };

  const clearActionError = (key: string) => {
    setActionErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const isActionBusy = (key: string) => actionBusyKeys.has(key);
  const setActionBusy = (key: string, busy: boolean) => {
    setActionBusyKeys((prev) => {
      const next = new Set(prev);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  };
  const isEmailBusy = (emailId: string) => Array.from(actionBusyKeys).some((key) => key.startsWith(`email:${emailId}:`));
  const hasSentSyncBusy = Array.from(actionBusyKeys).some(
    (key) => key.includes(":sent") || key === "application:email_sent"
  );
  const deleteTargetBusyKey = emailDeleteTarget ? `email:${emailDeleteTarget.email.id}:delete` : null;
  const deleteTargetSubmitting = deleteTargetBusyKey ? isActionBusy(deleteTargetBusyKey) : false;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!focusEmailId) return;
    const el = document.getElementById(`email-${focusEmailId}`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusEmailId, ppaDetails, applicationId]);

  const updateActiveSubject = async (ppa: PerProfileApplication, nextIndex: number) => {
    const plan = ppa.cold_email_plan;
    if (!plan) return;
    if (nextIndex === plan.selected_subject_index) return;
    const busyKey = `${ppa.id}:${nextIndex}`;
    const errorKey = `subject:${ppa.id}`;
    clearActionError(errorKey);
    setSubjectUpdateBusyKey(busyKey);
    const nextPlan = { ...plan, selected_subject_index: nextIndex };
    const prevPpas = ppaDetails;
    setPpaDetails((prev) =>
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
      mergeUpdatedPpa(updated);
    } catch (e) {
      setPpaDetails(prevPpas);
      setActionError(errorKey, (e as Error).message);
    } finally {
      setSubjectUpdateBusyKey(null);
    }
  };

  const getRecipientForEmail = (ppa: PerProfileApplication, em: Email) => em.to ?? ppa.cold_email_plan?.to ?? null;

  const startEditRecipient = (ppa: PerProfileApplication) => {
    const current = ppa.cold_email_plan?.to ?? null;
    setEditingRecipientPpaId(ppa.id);
    setRecipientDraftByPpa((prev) => ({
      ...prev,
      [ppa.id]: {
        title: current?.title ?? "",
        name: current?.name ?? "",
        email: current?.email ?? "",
        timezone: current?.timezone ?? ""
      }
    }));
  };

  const cancelEditRecipient = () => {
    setEditingRecipientPpaId(null);
  };

  const saveRecipient = async (ppa: PerProfileApplication) => {
    const draft = recipientDraftByPpa[ppa.id];
    if (!draft) return;
    const errorKey = `recipient:${ppa.id}`;
    clearActionError(errorKey);
    const basePlan = ppa.cold_email_plan ?? {
      subjects: [],
      selected_subject_index: 0,
      status: "none"
    };
    const normalizedTo = {
      title: draft.title.trim(),
      name: draft.name.trim(),
      email: draft.email.trim() || null,
      timezone: draft.timezone.trim() || null
    };
    const nextPlan = {
      ...basePlan,
      to: normalizedTo
    };

    setRecipientUpdateBusyPpaId(ppa.id);
    const prevPpas = ppaDetails;
    setPpaDetails((prev) =>
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
      mergeUpdatedPpa(updated);
      setEditingRecipientPpaId(null);
    } catch (e) {
      setPpaDetails(prevPpas);
      setActionError(errorKey, (e as Error).message);
    } finally {
      setRecipientUpdateBusyPpaId(null);
    }
  };

  const toggleApplicationApplied = async () => {
    if (!application) return;
    const key = "application:applied";
    clearActionError(key);
    setActionBusy(key, true);
    try {
      const updated = await api.markApplied(application.id, !application.applied);
      setApplication(updated);
    } catch (e) {
      setActionError(key, (e as Error).message);
    } finally {
      setActionBusy(key, false);
    }
  };

  const toggleApplicationEmailSent = async () => {
    if (!application) return;
    const key = "application:email_sent";
    const nextValue = !application.email_sent;
    clearActionError(key);
    if (nextValue && sentEmails.length === 0) {
      setActionError(key, "Mark the specific sent email first, then the application tracker can be confirmed.");
      return;
    }
    setActionBusy(key, true);
    try {
      const updated = await api.markApplicationEmailSent(application.id, nextValue);
      setApplication(updated);
    } catch (e) {
      setActionError(key, (e as Error).message);
    } finally {
      setActionBusy(key, false);
    }
  };

  const syncApplicationEmailSent = async (nextHasSentEmail: boolean) => {
    if (!application || application.email_sent === nextHasSentEmail) return;
    const updatedApplication = await api.markApplicationEmailSent(application.id, nextHasSentEmail);
    setApplication(updatedApplication);
  };

  const toggleEmailSent = async (ppaId: string, em: Email) => {
    const key = `email:${em.id}:sent`;
    const nextSent = !em.sent;
    clearActionError(key);
    setActionBusy(key, true);
    try {
      const updated = await api.markEmailSent(em.id, nextSent);
      const nextPpas = ppaDetails.map((row) =>
        row.id === ppaId
          ? {
              ...row,
              emails: row.emails.map((email) => (email.id === updated.id ? updated : email))
            }
          : row
      );
      setPpaDetails(nextPpas);
      const nextHasSentEmail = nextPpas.some((row) => row.emails.some((email) => email.sent));
      await syncApplicationEmailSent(nextHasSentEmail);
    } catch (e) {
      setActionError(key, (e as Error).message);
    } finally {
      setActionBusy(key, false);
    }
  };

  const removeEmail = async () => {
    if (!emailDeleteTarget) return;
    const { ppaId, email } = emailDeleteTarget;
    const key = `email:${email.id}:delete`;
    clearActionError(key);
    setActionBusy(key, true);
    try {
      await api.deleteEmail(email.id);
      const nextPpas = ppaDetails.map((row) =>
        row.id === ppaId
          ? {
              ...row,
              emails: row.emails.filter((rowEmail) => rowEmail.id !== email.id)
            }
          : row
      );
      setPpaDetails(nextPpas);
      const nextHasSentEmail = nextPpas.some((row) => row.emails.some((email) => email.sent));
      await syncApplicationEmailSent(nextHasSentEmail);
      setEmailDeleteTarget(null);
    } catch (e) {
      setActionError(key, (e as Error).message);
    } finally {
      setActionBusy(key, false);
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
          <div className="card border border-base-300 bg-base-100 p-4 shadow">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold leading-tight">
                  <Link
                    to={`/companies/${application.company_id}`}
                    className="link link-hover text-primary decoration-2 underline-offset-4"
                  >
                    {company?.name ?? application.company_id}
                  </Link>
                </h2>
                {application.job_post?.job_link && (
                  <a
                    href={application.job_post.job_link}
                    className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Go to post
                  </a>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 text-sm ${applicationStatusBadgeClass(application.status)}`}>
                  <span className="sr-only">Application status:</span>
                  {formatApplicationStatusLabel(application.status)}
                </span>
                {application.status !== "company_research_pending" && (
                  <button
                    type="button"
                    className="btn btn-outline btn-warning btn-sm"
                    onClick={() => setClearToPendingOpen(true)}
                  >
                    Reset preparation
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2.5 grid gap-1.5 text-xs md:grid-cols-12">
              <p className="rounded-md bg-base-200/60 px-2.5 py-1.5 md:col-span-3">
                <span className="font-medium opacity-80">Applied:</span> {application.applied_at ?? "—"}
              </p>
              <p className="rounded-md bg-base-200/60 px-2.5 py-1.5 md:col-span-3">
                <span className="font-medium opacity-80">Email sent:</span> {application.email_sent_at ?? "—"}
              </p>
              {application.status !== "archived" && (
                <div className="flex flex-wrap gap-1.5 md:col-span-6 md:justify-end">
                  {application.status !== "invalid" && (
                    <>
                      <button
                        type="button"
                        className={`btn btn-sm ${application.applied ? "btn-outline" : "btn-success"}`}
                        disabled={
                          isActionBusy("application:applied") ||
                          (!application.applied && application.status !== "application_ready")
                        }
                        title={
                          !application.applied && application.status !== "application_ready"
                            ? "Mark applied is only available when status is Application ready."
                            : undefined
                        }
                        onClick={() => {
                          void toggleApplicationApplied();
                        }}
                      >
                        {isActionBusy("application:applied")
                          ? "Saving..."
                          : application.applied
                            ? "Unmark applied"
                            : "Mark applied"}
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${application.email_sent ? "btn-outline" : "btn-primary"}`}
                        disabled={
                          isActionBusy("application:email_sent") ||
                          hasSentSyncBusy ||
                          (!application.email_sent && sentEmails.length === 0)
                        }
                        title={
                          !application.email_sent && sentEmails.length === 0
                            ? "Mark a specific email as sent first."
                            : undefined
                        }
                        onClick={() => {
                          void toggleApplicationEmailSent();
                        }}
                      >
                        {isActionBusy("application:email_sent")
                          ? "Saving..."
                          : application.email_sent
                            ? "Unmark email sent"
                            : "Mark email sent"}
                      </button>
                    </>
                  )}
                  <button type="button" className="btn btn-warning btn-outline btn-sm" onClick={() => setArchiveOpen(true)}>
                    Archive
                  </button>
                </div>
              )}
            </div>
            {actionError(actionErrors, "application:applied")}
            {actionError(actionErrors, "application:email_sent")}
            {!application.email_sent && sentEmails.length === 0 && allEmails.length > 0 && (
              <p className="mt-2 text-xs text-warning">
                Mark a specific email as sent before confirming the application-level email tracker.
              </p>
            )}
            {application.email_sent && sentEmails.length === 0 && allEmails.length > 0 && (
              <p className="mt-2 text-xs text-warning">
                Application is marked email sent, but no email row is marked sent.
              </p>
            )}

            {application.status === "archived" && application.archive_reason && (
              <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                <span className="font-medium">Why archived:</span> {application.archive_reason}
              </p>
            )}

          </div>

          <section className="card border border-base-300 bg-base-100 p-4 shadow">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Review summary</h3>
                <p className="text-sm opacity-70">{nextAction}</p>
              </div>
              {recommendedPpa && (
                <div className="text-right text-sm">
                  <p className="font-medium">Top profile: {recommendedPpa.profile_name}</p>
                  {recommendedPpa.fit_score != null && <p className="opacity-70">Fit {recommendedPpa.fit_score}</p>}
                </div>
              )}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-lg border border-base-300 p-3">
                <h4 className="text-sm font-semibold">Readiness</h4>
                <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {readinessItems.map((item) => (
                    <li key={item.label} className="flex items-center gap-2">
                      <span className={`badge badge-xs ${item.ready ? "badge-success" : "badge-ghost"}`} />
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-base-300 p-3 text-sm">
                <h4 className="text-sm font-semibold">Selected outreach</h4>
                <p className="mt-2">
                  <span className="font-medium opacity-70">Subject:</span> {recommendedSubject ?? "Not selected"}
                </p>
                <p>
                  <span className="font-medium opacity-70">Recipient:</span>{" "}
                  {formatRecipient(recommendedRecipient) ?? "Not selected"}
                </p>
                {recommendedPpa?.tailored_resume_link ? (
                  <a
                    href={recommendedPpa.tailored_resume_link}
                    className="link link-secondary mt-2 inline-block"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Tailored resume
                  </a>
                ) : (
                  <p className="mt-2 opacity-70">No tailored resume link.</p>
                )}
              </div>
            </div>
          </section>

          <div className="card bg-base-100 p-4 shadow">
            <h3 className="mb-2 text-lg font-semibold">Per-profile analysis (ordered)</h3>
            <div className="space-y-4">
              {ppaDetails.map((ppa) => (
                <div key={ppa.id} className="rounded-lg border border-base-300 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      #{ppa.order_index} — {ppa.profile_name}
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

                  <div className="mt-3 space-y-3">
                    <div className="rounded-lg border border-base-300 bg-base-200/40 px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold">Recipient</h4>
                        {editingRecipientPpaId !== ppa.id && (
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            onClick={() => startEditRecipient(ppa)}
                          >
                            Edit recipient
                          </button>
                        )}
                      </div>
                      {editingRecipientPpaId === ppa.id ? (
                        <div className="mt-2">
                          <div className="grid gap-2 md:grid-cols-4">
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
                                    ...(prev[ppa.id] ?? { title: "", name: "", email: "", timezone: "" }),
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
                                    ...(prev[ppa.id] ?? { title: "", name: "", email: "", timezone: "" }),
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
                                    ...(prev[ppa.id] ?? { title: "", name: "", email: "", timezone: "" }),
                                    email: e.target.value
                                  }
                                }))
                              }
                            />
                            <input
                              type="text"
                              className="input input-sm input-bordered w-full"
                              placeholder="Timezone (e.g. America/New_York)"
                              aria-label="Recipient timezone"
                              value={recipientDraftByPpa[ppa.id]?.timezone ?? ""}
                              onChange={(e) =>
                                setRecipientDraftByPpa((prev) => ({
                                  ...prev,
                                  [ppa.id]: {
                                    ...(prev[ppa.id] ?? { title: "", name: "", email: "", timezone: "" }),
                                    timezone: e.target.value
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
                              {recipientUpdateBusyPpaId === ppa.id ? "Saving..." : "Save recipient"}
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
                          {actionError(actionErrors, `recipient:${ppa.id}`)}
                        </div>
                      ) : (
                        <p className="mt-1 text-sm">{formatRecipient(ppa.cold_email_plan?.to) ?? "No recipient selected."}</p>
                      )}
                    </div>

                    <div className="rounded-lg border border-base-300 bg-base-200/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold">Outreach plan</h4>
                        {ppa.cold_email_plan?.status && (
                          <span className="badge badge-ghost">{ppa.cold_email_plan.status}</span>
                        )}
                      </div>
                      {ppa.cold_email_plan?.subjects?.length ? (
                        <div className="mt-3">
                          <p className="text-xs font-semibold uppercase opacity-70">Subject options</p>
                          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {ppa.cold_email_plan.subjects.map((subject, index) => {
                              const isActive = index === ppa.cold_email_plan?.selected_subject_index;
                              return (
                                <button
                                  type="button"
                                  key={`${ppa.id}-subject-${index}`}
                                  disabled={subjectUpdateBusyKey != null}
                                  className={
                                    isActive
                                      ? "btn btn-primary btn-xs h-auto min-h-8 justify-start whitespace-normal px-3 py-2 text-left normal-case"
                                      : "btn btn-outline btn-xs h-auto min-h-8 justify-start whitespace-normal px-3 py-2 text-left normal-case"
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
                          {actionError(actionErrors, `subject:${ppa.id}`)}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm opacity-70">No subject options generated.</p>
                      )}
                    </div>
                  </div>

                  <LazyDetails
                    className="mt-3 rounded-lg border border-base-300 bg-base-100 p-3"
                    summaryClassName="cursor-pointer text-sm font-semibold"
                    summary="Analysis"
                  >
                    <p className="mt-2 whitespace-pre-wrap text-sm">{ppa.analysis || "—"}</p>
                  </LazyDetails>

                  <div className="mt-3">
                    <h4 className="text-sm font-semibold">Emails</h4>
                    <ul className="space-y-2">
                        {ppa.emails.map((em) => (
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
                                  disabled={isEmailBusy(em.id) || hasSentSyncBusy}
                                  onClick={() => {
                                    void toggleEmailSent(ppa.id, em);
                                  }}
                                >
                                  {isActionBusy(`email:${em.id}:sent`)
                                    ? "Saving..."
                                    : em.sent
                                      ? "Unmark email sent"
                                      : "Mark email sent"}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-xs btn-error btn-outline"
                                  aria-label="Delete email"
                                  disabled={isEmailBusy(em.id)}
                                  onClick={() => {
                                    clearActionError(`email:${em.id}:delete`);
                                    setEmailDeleteTarget({
                                      ppaId: ppa.id,
                                      profileName: ppa.profile_name,
                                      email: em,
                                      recipientLabel: formatRecipient(getRecipientForEmail(ppa, em))
                                    });
                                  }}
                                >
                                  {isActionBusy(`email:${em.id}:delete`) ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </div>

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

                            {em.to && (
                              <p className="mb-3 text-sm">
                                <span className="font-medium opacity-70">Email-specific recipient:</span>{" "}
                                {formatRecipient(getRecipientForEmail(ppa, em))}
                              </p>
                            )}
                            {actionError(actionErrors, `email:${em.id}:sent`)}
                            {actionError(actionErrors, `email:${em.id}:delete`)}
                            <LazyDetails
                              className="rounded-lg border border-base-300 bg-base-200/40 p-3"
                              summaryClassName="cursor-pointer text-sm font-semibold"
                              summary="Email body"
                            >
                              <EmailHtmlContent content={em.content} />
                            </LazyDetails>
                          </li>
                        ))}
                        {ppa.emails.length === 0 && (
                          <li className="rounded-lg border border-dashed border-base-300 bg-base-100 p-4 text-sm opacity-70">
                            No emails yet.
                          </li>
                        )}
                    </ul>
                  </div>
                </div>
              ))}
              {ppaDetails.length === 0 && <p className="text-sm opacity-70">No per-profile rows yet.</p>}
            </div>
          </div>

          <ArchiveApplicationModal
            open={archiveOpen}
            onClose={() => setArchiveOpen(false)}
            applicationId={application.id}
            companyLabel={company?.name ?? application.company_id}
            onArchived={load}
          />
          <ClearApplicationToPendingModal
            open={clearToPendingOpen}
            onClose={() => setClearToPendingOpen(false)}
            applicationId={application.id}
            companyLabel={company?.name ?? application.company_id}
            targetStatus={clearResetTargetStatus(company)}
            onCleared={load}
          />
          <DestructiveConfirmModal
            open={emailDeleteTarget != null}
            onClose={() => {
              if (deleteTargetSubmitting) return;
              setEmailDeleteTarget(null);
            }}
            onConfirm={() => {
              void removeEmail();
            }}
            title="Delete email?"
            confirmLabel="Delete email"
            confirmingLabel="Deleting..."
            submitting={deleteTargetSubmitting}
            error={deleteTargetBusyKey ? actionErrors[deleteTargetBusyKey] ?? null : null}
          >
            <p>
              This will permanently delete the <strong>{emailDeleteTarget?.email.kind ?? "selected"}</strong> email for{" "}
              <strong>{emailDeleteTarget?.profileName ?? "this profile"}</strong>. This cannot be undone.
            </p>
            <p className="opacity-80">
              Recipient: <strong>{emailDeleteTarget?.recipientLabel ?? "Not set"}</strong>
            </p>
          </DestructiveConfirmModal>
        </>
      )}
    </div>
  );
};
