import { FormEvent, useContext, useEffect, useRef, useState } from "react";
import { UNSAFE_NavigationContext, useNavigate, useParams } from "react-router-dom";

import { MarkdownModal } from "../components/MarkdownModal";
import { Modal } from "../components/Modal";
import { api } from "../api";
import { useAuth } from "../auth";
import { Profile, ProfileCreatePayload } from "../types";

type EdRow = { university_name: string; from_year: string; to_year: string };
type EdRowErrors = { from_year: string | null; to_year: string | null };
type ProfileSection = "basics" | "education" | "writing";
type ProfileFormSnapshot = {
  name: string;
  location: string;
  email: string;
  phone: string;
  bioMd: string;
  nicheMd: string;
  resumeMd: string;
  edRows: EdRow[];
};

const emptyEdRow = (): EdRow => ({ university_name: "", from_year: "", to_year: "" });
const MIN_EDUCATION_YEAR = 1900;
const MAX_EDUCATION_YEAR = 2100;
const YEAR_INPUT_PATTERN = /^\d{4}$/;

export const ProfileDetailPage = () => {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const navigation = useContext(UNSAFE_NavigationContext);
  const { user } = useAuth();
  const isNew = profileId === "new";
  const canEditProfiles = user?.role === "admin";
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const bypassNavigationGuardRef = useRef(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bioMd, setBioMd] = useState("");
  const [nicheMd, setNicheMd] = useState("");
  const [resumeMd, setResumeMd] = useState("");
  const [edRows, setEdRows] = useState<EdRow[]>([emptyEdRow()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [bioPreviewOpen, setBioPreviewOpen] = useState(false);
  const [nichePreviewOpen, setNichePreviewOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<ProfileSection>("basics");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const markDirty = () => {
    setSavedMessage(null);
    setHasUnsavedChanges(true);
  };

  const profileToFormSnapshot = (p: Profile): ProfileFormSnapshot => ({
    name: p.name,
    location: p.location ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    bioMd: p.bio_md ?? "",
    nicheMd: p.niche_info_md ?? "",
    resumeMd: p.resume_md ?? "",
    edRows: p.educations?.length
      ? p.educations.map((e) => ({
          university_name: e.university_name,
          from_year: e.from_year != null ? String(e.from_year) : "",
          to_year: e.to_year != null ? String(e.to_year) : ""
        }))
      : [emptyEdRow()]
  });

  const applyProfileForm = (snapshot: ProfileFormSnapshot, options?: { markSaved?: boolean }) => {
    setName(snapshot.name);
    setLocation(snapshot.location);
    setEmail(snapshot.email);
    setPhone(snapshot.phone);
    setBioMd(snapshot.bioMd);
    setNicheMd(snapshot.nicheMd);
    setResumeMd(snapshot.resumeMd);
    setEdRows(snapshot.edRows);
    if (options?.markSaved) {
      setHasUnsavedChanges(false);
    }
  };

  const load = async () => {
    if (!profileId || isNew) return;
    setError(null);
    setSavedMessage(null);
    try {
      const p = await api.getProfile(profileId);
      setProfile(p);
      applyProfileForm(profileToFormSnapshot(p), { markSaved: true });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (isNew) {
      setProfile(null);
      applyProfileForm({
        name: "",
        location: "",
        email: "",
        phone: "",
        bioMd: "",
        nicheMd: "",
        resumeMd: "",
        edRows: [emptyEdRow()]
      }, { markSaved: true });
      setError(null);
      setSavedMessage(null);
      return;
    }
    void load();
  }, [profileId, isNew]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const navigator = navigation.navigator;
    const originalPush = navigator.push;
    const originalReplace = navigator.replace;
    const originalGo = navigator.go;

    const blockOrRun = (run: () => void) => {
      if (!hasUnsavedChanges || bypassNavigationGuardRef.current) {
        run();
        return;
      }
      pendingNavigationRef.current = run;
      setLeaveConfirmOpen(true);
    };

    navigator.push = ((...args: Parameters<typeof originalPush>) => {
      blockOrRun(() => originalPush(...args));
    }) as typeof originalPush;
    navigator.replace = ((...args: Parameters<typeof originalReplace>) => {
      blockOrRun(() => originalReplace(...args));
    }) as typeof originalReplace;
    navigator.go = ((...args: Parameters<typeof originalGo>) => {
      blockOrRun(() => originalGo(...args));
    }) as typeof originalGo;

    return () => {
      navigator.push = originalPush;
      navigator.replace = originalReplace;
      navigator.go = originalGo;
    };
  }, [hasUnsavedChanges, navigation.navigator]);

  const parseYear = (s: string): number | null => {
    const t = s.trim();
    if (!t) return null;
    if (!YEAR_INPUT_PATTERN.test(t)) return null;
    const n = Number(t);
    if (!Number.isInteger(n)) return null;
    if (n < MIN_EDUCATION_YEAR || n > MAX_EDUCATION_YEAR) return null;
    return n;
  };

  const validateYear = (value: string, label: "From" | "To"): string | null => {
    const t = value.trim();
    if (!t) return null;
    if (!YEAR_INPUT_PATTERN.test(t)) return `${label} year must be a 4-digit year.`;
    const n = Number(t);
    if (!Number.isInteger(n) || n < MIN_EDUCATION_YEAR || n > MAX_EDUCATION_YEAR) {
      return `${label} year must be between ${MIN_EDUCATION_YEAR} and ${MAX_EDUCATION_YEAR}.`;
    }
    return null;
  };

  const educationRowErrors: EdRowErrors[] = edRows.map((row) => ({
    from_year: validateYear(row.from_year, "From"),
    to_year: validateYear(row.to_year, "To")
  }));
  const hasEducationYearErrors = educationRowErrors.some((row) => row.from_year || row.to_year);

  const buildEducations = () => {
    return edRows
      .filter((r) => r.university_name.trim() !== "")
      .map((r) => ({
        university_name: r.university_name.trim(),
        from_year: parseYear(r.from_year),
        to_year: parseYear(r.to_year)
      }));
  };

  const validateCreate = (): string | null => {
    if (!name.trim()) return "Name is required.";
    if (!location.trim()) return "Location is required.";
    if (!email.trim()) return "Email is required.";
    if (!phone.trim()) return "Phone is required.";
    if (!bioMd.trim()) return "Bio (markdown) is required.";
    if (!nicheMd.trim()) return "Niche (markdown) is required.";
    const eds = buildEducations();
    if (eds.length === 0) return "Add at least one education with a university name.";
    return null;
  };

  const validateEdit = (): string | null => {
    if (!name.trim()) return "Name is required.";
    return null;
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEditProfiles) return;
    if (hasEducationYearErrors) {
      setError("Fix education year errors before saving.");
      return;
    }
    const v = validateCreate();
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    setError(null);
    const payload: ProfileCreatePayload = {
      name: name.trim(),
      location: location.trim(),
      email: email.trim(),
      phone: phone.trim(),
      educations: buildEducations(),
      bio_md: bioMd.trim(),
      niche_info_md: nicheMd.trim(),
      resume_md: resumeMd.trim() ? resumeMd.trim() : null
    };
    try {
      const created = await api.createProfile(payload);
      setProfile(created);
      applyProfileForm(profileToFormSnapshot(created), { markSaved: true });
      setSavedMessage("Profile created.");
      navigate(`/profiles/${created.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onSaveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEditProfiles) return;
    if (!profileId || isNew) return;
    if (hasEducationYearErrors) {
      setError("Fix education year errors before saving.");
      return;
    }
    const v = validateEdit();
    if (v) {
      setActiveSection("basics");
      setError(v);
      return;
    }
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const updated = await api.updateProfile(profileId, {
        name: name.trim(),
        location: location.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        educations: buildEducations(),
        bio_md: bioMd.trim() || null,
        niche_info_md: nicheMd.trim() || null,
        resume_md: resumeMd.trim() ? resumeMd.trim() : null
      });
      setProfile(updated);
      applyProfileForm(profileToFormSnapshot(updated), { markSaved: true });
      setSavedMessage(`Saved ${new Date(updated.updated_at).toLocaleString()}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!canEditProfiles || !profileId || isNew || !profile) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteProfile(profileId);
      navigate("/profiles");
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  };

  const requestProfilesNavigation = () => {
    navigate("/profiles");
  };

  const confirmLeave = () => {
    const pendingNavigation = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setLeaveConfirmOpen(false);
    bypassNavigationGuardRef.current = true;
    if (pendingNavigation) {
      pendingNavigation();
    } else {
      navigate("/profiles");
    }
    window.setTimeout(() => {
      bypassNavigationGuardRef.current = false;
    }, 0);
  };

  const sectionButtonClass = (section: ProfileSection) =>
    `btn btn-sm ${activeSection === section ? "btn-active" : "btn-ghost"}`;

  if (!profileId) return <div>Missing profile id</div>;
  if (isNew && !canEditProfiles) return <div className="alert alert-warning">Profile creation is admin-only.</div>;

  return (
    <div className="space-y-4">
      <div className="breadcrumbs text-sm">
        <ul>
          <li>
            <button type="button" className="link" onClick={requestProfilesNavigation}>
              Profiles
            </button>
          </li>
          <li>{isNew ? "New profile" : profile?.name ?? "Profile"}</li>
        </ul>
      </div>
      {error && <div className="alert alert-error text-sm">{error}</div>}
      {savedMessage && <div className="alert alert-success text-sm">{savedMessage}</div>}
      {hasUnsavedChanges && (
        <div className="alert alert-warning text-sm">
          You have unsaved profile changes. Save or discard them before leaving this page.
        </div>
      )}
      {!isNew && !profile && !error && <span className="loading loading-spinner" />}

      {(isNew || profile) && (
        <div className="card bg-base-100 p-4 shadow">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{isNew ? "Create profile" : profile?.name}</h2>
              {!isNew && profile && (
                <p className="mt-1 text-sm opacity-70">
                  Updated {new Date(profile.updated_at).toLocaleString()} · ID{" "}
                  <span className="font-mono text-xs">{profile.id}</span>
                </p>
              )}
            </div>
            {hasUnsavedChanges && <span className="badge badge-warning">Unsaved</span>}
          </div>
          {!isNew && profile && (
            <div className="tabs tabs-boxed mb-4 w-fit">
              <button type="button" className={sectionButtonClass("basics")} onClick={() => setActiveSection("basics")}>
                Basics
              </button>
              <button
                type="button"
                className={sectionButtonClass("education")}
                onClick={() => setActiveSection("education")}
              >
                Education
              </button>
              <button type="button" className={sectionButtonClass("writing")} onClick={() => setActiveSection("writing")}>
                Writing
              </button>
            </div>
          )}
          <form className="space-y-3" onSubmit={isNew ? onCreate : onSaveEdit}>
            {(isNew || activeSection === "basics") && (
              <section className="space-y-3" aria-label="Profile basics">
                <label className="form-control w-full">
                  <span className="label-text">Name</span>
                  <input
                    className="input input-bordered w-full"
                    value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    markDirty();
                  }}
                    required
                    autoFocus={isNew}
                    disabled={!canEditProfiles}
                  />
                </label>
                <label className="form-control w-full">
                  <span className="label-text">Location</span>
                  <input
                    className="input input-bordered w-full"
                    value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    markDirty();
                  }}
                    required={isNew}
                    disabled={!canEditProfiles}
                  />
                </label>
                <label className="form-control w-full">
                  <span className="label-text">Email</span>
                  <input
                    className="input input-bordered w-full"
                    type="email"
                    value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    markDirty();
                  }}
                    required={isNew}
                    disabled={!canEditProfiles}
                  />
                </label>
                <label className="form-control w-full">
                  <span className="label-text">Phone</span>
                  <input
                    className="input input-bordered w-full"
                    value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    markDirty();
                  }}
                    required={isNew}
                    disabled={!canEditProfiles}
                  />
                </label>
              </section>
            )}

            {(isNew || activeSection === "education") && (
            <section aria-label="Profile education">
              <div className="mb-1 flex items-center justify-between">
                <span className="label-text font-medium">Education</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={!canEditProfiles}
                  onClick={() => {
                    setEdRows((rows) => [...rows, emptyEdRow()]);
                    markDirty();
                  }}
                >
                  + Add row
                </button>
              </div>
              <div className="space-y-2 rounded-lg border border-base-300 p-3">
                {edRows.map((row, idx) => (
                  <div key={idx} className="flex flex-wrap gap-2 border-b border-base-200 pb-2 last:border-0 last:pb-0">
                    <input
                      className="input input-bordered input-sm min-w-[200px] flex-1"
                      placeholder="University name *"
                      value={row.university_name}
                      onChange={(e) => {
                        const next = [...edRows];
                        next[idx] = { ...next[idx], university_name: e.target.value };
                        setEdRows(next);
                        markDirty();
                      }}
                      disabled={!canEditProfiles}
                    />
                    <input
                      className="input input-bordered input-sm w-24"
                      placeholder="From"
                      inputMode="numeric"
                      aria-invalid={educationRowErrors[idx].from_year ? "true" : "false"}
                      value={row.from_year}
                      onChange={(e) => {
                        const next = [...edRows];
                        next[idx] = { ...next[idx], from_year: e.target.value };
                        setEdRows(next);
                        markDirty();
                      }}
                      disabled={!canEditProfiles}
                    />
                    <input
                      className="input input-bordered input-sm w-24"
                      placeholder="To"
                      inputMode="numeric"
                      aria-invalid={educationRowErrors[idx].to_year ? "true" : "false"}
                      value={row.to_year}
                      onChange={(e) => {
                        const next = [...edRows];
                        next[idx] = { ...next[idx], to_year: e.target.value };
                        setEdRows(next);
                        markDirty();
                      }}
                      disabled={!canEditProfiles}
                    />
                    {edRows.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        disabled={!canEditProfiles}
                        onClick={() => {
                          setEdRows((rows) => rows.filter((_, i) => i !== idx));
                          markDirty();
                        }}
                      >
                        Remove
                      </button>
                    )}
                    {(educationRowErrors[idx].from_year || educationRowErrors[idx].to_year) && (
                      <div className="w-full text-xs text-error">
                        {educationRowErrors[idx].from_year && <p>{educationRowErrors[idx].from_year}</p>}
                        {educationRowErrors[idx].to_year && <p>{educationRowErrors[idx].to_year}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {isNew && <p className="mt-1 text-xs opacity-60">At least one row with a university name is required.</p>}
            </section>
            )}

            {(isNew || activeSection === "writing") && (
              <section className="space-y-3" aria-label="Profile writing">
                <div className="form-control w-full">
                  <div className="label items-start pb-1 pt-0">
                    <span className="label-text">Bio (markdown)</span>
                    {bioMd.trim() ? (
                      <button
                        type="button"
                        className="link link-primary label-text-alt text-sm font-medium"
                        onClick={() => setBioPreviewOpen(true)}
                      >
                        View markdown
                      </button>
                    ) : null}
                  </div>
                  <textarea
                    className="textarea textarea-bordered min-h-[100px] w-full font-mono text-sm"
                    value={bioMd}
                    onChange={(e) => {
                      setBioMd(e.target.value);
                      markDirty();
                    }}
                    required={isNew}
                    aria-label="Bio markdown"
                    disabled={!canEditProfiles}
                  />
                </div>
                <div className="form-control w-full">
                  <div className="label items-start pb-1 pt-0">
                    <span className="label-text">Niche (markdown)</span>
                    {nicheMd.trim() ? (
                      <button
                        type="button"
                        className="link link-primary label-text-alt text-sm font-medium"
                        onClick={() => setNichePreviewOpen(true)}
                      >
                        View markdown
                      </button>
                    ) : null}
                  </div>
                  <textarea
                    className="textarea textarea-bordered min-h-[100px] w-full font-mono text-sm"
                    value={nicheMd}
                    onChange={(e) => {
                      setNicheMd(e.target.value);
                      markDirty();
                    }}
                    required={isNew}
                    aria-label="Niche markdown"
                    disabled={!canEditProfiles}
                  />
                </div>
                <label className="form-control w-full">
                  <span className="label-text">Resume (markdown, optional)</span>
                  <textarea
                    className="textarea textarea-bordered min-h-[80px] w-full font-mono text-sm"
                    value={resumeMd}
                    onChange={(e) => {
                      setResumeMd(e.target.value);
                      markDirty();
                    }}
                    disabled={!canEditProfiles}
                  />
                </label>
              </section>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              {canEditProfiles && (
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || hasEducationYearErrors || (!isNew && !hasUnsavedChanges)}
                >
                  {saving ? "Saving…" : isNew ? "Create profile" : "Save changes"}
                </button>
              )}
              {!isNew && canEditProfiles && (
                <button type="button" className="btn btn-outline btn-error" onClick={() => setDeleteOpen(true)}>
                  Delete profile
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      <MarkdownModal
        open={bioPreviewOpen}
        onClose={() => setBioPreviewOpen(false)}
        title={`Bio — ${isNew ? name.trim() || "New profile" : profile?.name ?? name}`}
        markdown={bioMd}
        size="full"
      />
      <MarkdownModal
        open={nichePreviewOpen}
        onClose={() => setNichePreviewOpen(false)}
        title={`Niche — ${isNew ? name.trim() || "New profile" : profile?.name ?? name}`}
        markdown={nicheMd}
        size="full"
      />
      <Modal
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="Delete profile"
        closeDisabled={deleting}
      >
        <div className="space-y-4 text-sm">
          <p>
            Delete <span className="font-semibold">{profile?.name}</span>? This removes the profile from JobCRM and
            cannot be undone.
          </p>
          {profile?.email && <p className="opacity-70">Email: {profile.email}</p>}
          <div className="modal-action">
            <button type="button" className="btn btn-ghost" disabled={deleting} onClick={() => setDeleteOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-error" disabled={deleting} onClick={() => void onDelete()}>
              {deleting ? "Deleting..." : "Delete profile"}
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        open={leaveConfirmOpen}
        onClose={() => setLeaveConfirmOpen(false)}
        title="Discard unsaved profile changes?"
      >
        <div className="space-y-4 text-sm">
          <p>You have unsaved changes on this profile. Leaving now will discard edits that have not been saved.</p>
          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={() => setLeaveConfirmOpen(false)}>
              Keep editing
            </button>
            <button type="button" className="btn btn-warning" onClick={confirmLeave}>
              Discard and leave
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
