import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../api";
import { useAuth } from "../auth";
import { Modal } from "../components/Modal";
import { TablePagination } from "../components/TablePagination";
import { ProfileListItem } from "../types";

const PAGE_SIZE = 20;
type ProfileStatusFilter = "all" | "active" | "frozen";
type ProfileListAction =
  | { kind: "freeze"; profile: ProfileListItem; nextFrozen: boolean }
  | { kind: "delete"; profile: ProfileListItem };

export const ProfilesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<ProfileListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProfileStatusFilter>("all");
  const [hasNextPage, setHasNextPage] = useState(false);
  const [pendingAction, setPendingAction] = useState<ProfileListAction | null>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const canEditProfiles = user?.role === "admin";

  const load = useCallback(
    async (targetPage = page) => {
      try {
        setError(null);
        const params = new URLSearchParams({
          skip: String((targetPage - 1) * PAGE_SIZE),
          limit: String(PAGE_SIZE + 1)
        });
        if (searchQuery.trim()) {
          params.set("search", searchQuery.trim());
        }
        if (statusFilter !== "all") {
          params.set("frozen", String(statusFilter === "frozen"));
        }
        const response = await api.listProfileSummaries(params);
        setItems(response.slice(0, PAGE_SIZE));
        setHasNextPage(response.length > PAGE_SIZE);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [page, searchQuery, statusFilter]
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  useEffect(() => {
    if (items.length === 0 && page > 1) {
      setPage((current) => Math.max(1, current - 1));
    }
  }, [items.length, page]);

  const closeActionModal = () => {
    if (actionSubmitting) return;
    setPendingAction(null);
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    setActionSubmitting(true);
    setError(null);
    try {
      if (pendingAction.kind === "freeze") {
        await api.updateProfile(pendingAction.profile.id, { frozen: pendingAction.nextFrozen });
      } else {
        await api.deleteProfile(pendingAction.profile.id);
      }
      setPendingAction(null);
      await load(page);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionSubmitting(false);
    }
  };

  const actionTitle =
    pendingAction?.kind === "freeze"
      ? pendingAction.nextFrozen
        ? "Freeze profile"
        : "Unfreeze profile"
      : pendingAction?.kind === "delete"
        ? "Delete profile"
        : "";
  const actionConfirmLabel =
    pendingAction?.kind === "freeze"
      ? pendingAction.nextFrozen
        ? "Freeze profile"
        : "Unfreeze profile"
      : pendingAction?.kind === "delete"
        ? "Delete profile"
        : "";

  return (
    <div className="space-y-4">
      <section className="card bg-base-100 p-4 shadow">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Profiles</h2>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load(page)}>
              Refresh
            </button>
            {canEditProfiles && (
              <button
                type="button"
                className="btn btn-circle btn-primary btn-sm"
                title="New profile"
                aria-label="New profile"
                onClick={() => navigate("/profiles/new")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {error && <div className="alert alert-error mb-3 text-sm">{error}</div>}
        <form
          className="mb-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearchQuery(searchInput.trim());
          }}
        >
          <label className="form-control min-w-[220px] flex-1">
            <span className="label-text text-xs">Search</span>
            <input
              className="input input-bordered input-sm w-full"
              placeholder="Name, email, location, niche"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label="Search profiles"
            />
          </label>
          <button type="submit" className="btn btn-sm btn-ghost">
            Search
          </button>
          <label className="form-control w-full min-w-[140px] max-w-[180px]">
            <span className="label-text text-xs">Status</span>
            <select
              className="select select-bordered select-sm w-full"
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value as ProfileStatusFilter);
              }}
              aria-label="Filter profiles by status"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="frozen">Frozen</option>
            </select>
          </label>
        </form>
        <div className="overflow-x-auto rounded-lg border border-base-300">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Location</th>
                <th>Email</th>
                <th>Phone</th>
                <th className="whitespace-nowrap">Updated</th>
                <th className="w-52 text-right">{canEditProfiles ? "Actions" : ""}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((profile) => (
                <tr
                  key={profile.id}
                  className="cursor-pointer hover:bg-base-200"
                  onClick={() => navigate(`/profiles/${profile.id}`)}
                >
                  <td className="font-medium">
                    {profile.name}
                  </td>
                  <td>
                    {profile.frozen ? (
                      <span className="badge badge-warning badge-sm">Frozen</span>
                    ) : (
                      <span className="badge badge-success badge-sm">Active</span>
                    )}
                  </td>
                  <td className="max-w-[140px] truncate text-xs opacity-80" title={profile.location ?? undefined}>
                    {profile.location ?? "—"}
                  </td>
                  <td className="max-w-[160px] truncate text-xs opacity-80">{profile.email ?? "—"}</td>
                  <td className="max-w-[120px] truncate text-xs opacity-80">{profile.phone ?? "—"}</td>
                  <td className="whitespace-nowrap text-xs opacity-80">
                    {new Date(profile.updated_at).toLocaleString()}
                  </td>
                  <td className="text-right">
                    {canEditProfiles ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className={`btn btn-xs ${profile.frozen ? "btn-success btn-outline" : "btn-warning btn-outline"}`}
                          disabled={actionSubmitting}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingAction({
                              kind: "freeze",
                              profile,
                              nextFrozen: !profile.frozen
                            });
                          }}
                        >
                          {profile.frozen ? "Unfreeze" : "Freeze"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-error btn-outline"
                          disabled={actionSubmitting}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingAction({ kind: "delete", profile });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <p className="p-4 text-sm opacity-70">
              {searchQuery || statusFilter !== "all" ? "No profiles match current filters." : "No profiles yet."}
            </p>
          )}
        </div>
        <TablePagination
          page={page}
          hasNextPage={hasNextPage}
          onPageChange={setPage}
          pageSize={PAGE_SIZE}
          visibleCount={items.length}
          itemLabel="profiles"
        />
        <p className="mt-2 text-xs opacity-60">
          {canEditProfiles
            ? "Click a row to view and edit. Use + to create a profile (all fields except resume are required)."
            : "Click a row to view profile details."}
        </p>
      </section>
      <Modal
        open={pendingAction !== null}
        onClose={closeActionModal}
        title={actionTitle}
        size="md"
        closeDisabled={actionSubmitting}
      >
        <div className="space-y-3">
          {pendingAction?.kind === "freeze" && (
            <p className="text-sm leading-relaxed opacity-90">
              {pendingAction.nextFrozen ? "Freeze" : "Unfreeze"}{" "}
              <span className="font-medium">{pendingAction.profile.name}</span>.
              {pendingAction.nextFrozen
                ? " Frozen profiles are excluded from the agent profile endpoints until you unfreeze them."
                : " This restores profile visibility for agent profile endpoints."}
            </p>
          )}
          {pendingAction?.kind === "delete" && (
            <p className="text-sm leading-relaxed opacity-90">
              Delete <span className="font-medium">{pendingAction.profile.name}</span> permanently. This cannot be
              undone.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-ghost" onClick={closeActionModal} disabled={actionSubmitting}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${pendingAction?.kind === "delete" ? "btn-error" : "btn-warning"}`}
              onClick={() => void confirmAction()}
              disabled={actionSubmitting || pendingAction === null}
            >
              {actionSubmitting
                ? pendingAction?.kind === "delete"
                  ? "Deleting…"
                  : "Saving…"
                : actionConfirmLabel}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
