import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "../api";
import { invalidateIndustryCatalogCache } from "../state/industryCatalog";
import { Industry } from "../types";
import { DestructiveConfirmModal } from "../components/DestructiveConfirmModal";
import { TablePagination } from "../components/TablePagination";

const PAGE_SIZE = 25;

export const IndustriesPage = () => {
  const [items, setItems] = useState<Industry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Industry | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const industryPageParams = () => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    params.set("skip", String((page - 1) * PAGE_SIZE));
    params.set("limit", String(PAGE_SIZE));
    return params;
  };

  const industryCountParams = () => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    return params;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listIndustries(industryPageParams());
      setItems(rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadCount = async () => {
    try {
      const count = await api.countIndustries(industryCountParams());
      setTotal(count.total);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchQuery]);

  useEffect(() => {
    void loadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (items.length === 0 && total > 0 && page > 1) {
      setPage((current) => Math.max(1, current - 1));
    }
  }, [items.length, page, total]);

  const onSingleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await api.createIndustry({ name, description });
      invalidateIndustryCatalogCache();
      setName("");
      setDescription("");
      await Promise.all([load(), loadCount()]);
      setSuccess("Industry created.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const parseBulkEntries = (source: string) => {
    const lines = source
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      throw new Error("Add at least one line for bulk creation.");
    }
    return lines.map((line, index) => {
      const [rawName, ...rest] = line.split("|");
      const parsedName = rawName?.trim() ?? "";
      if (!parsedName) {
        throw new Error(`Line ${index + 1}: name is required.`);
      }
      return {
        name: parsedName,
        description: rest.join("|").trim()
      };
    });
  };

  const onBulkSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const industries = parseBulkEntries(bulkText);
      await api.bulkCreateIndustries({ industries });
      invalidateIndustryCatalogCache();
      setBulkText("");
      await Promise.all([load(), loadCount()]);
      setSuccess(`${industries.length} industries created.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (industry: Industry) => {
    setEditingId(industry.id);
    setEditName(industry.name);
    setEditDescription(industry.description ?? "");
    setError(null);
    setSuccess(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
  };

  const saveEdit = async (industryId: string) => {
    if (!editName.trim()) {
      setError("Industry name is required.");
      return;
    }
    setSavingId(industryId);
    setError(null);
    setSuccess(null);
    try {
      await api.updateIndustry(industryId, {
        name: editName.trim(),
        description: editDescription.trim()
      });
      invalidateIndustryCatalogCache();
      await Promise.all([load(), loadCount()]);
      cancelEdit();
      setSuccess("Industry updated.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  const removeIndustry = async () => {
    if (!deleteTarget) return;
    const industry = deleteTarget;
    setDeletingId(industry.id);
    setDeleteError(null);
    setError(null);
    setSuccess(null);
    try {
      await api.deleteIndustry(industry.id);
      invalidateIndustryCatalogCache();
      await Promise.all([load(), loadCount()]);
      setSuccess(`Deleted "${industry.name}".`);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError((err as Error).message);
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  const selectedCount = useMemo(() => items.length, [items]);
  const hasNextPage = page * PAGE_SIZE < total;
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <section className="card bg-base-100 shadow">
        <div className="flex flex-wrap items-end justify-between gap-4 p-4">
          <div>
            <h2 className="text-xl font-semibold">Industries</h2>
            <p className="text-sm opacity-70">
              Manage industry taxonomy with single or bulk creation, inline editing, and deletion.
            </p>
          </div>
          <div className="stats stats-horizontal border border-base-300 bg-base-200/50">
            <div className="stat px-4 py-2">
              <div className="stat-title text-xs">Visible industries</div>
              <div className="stat-value text-xl">{selectedCount}</div>
              <div className="stat-desc">
                {rangeStart}-{rangeEnd} of {total}
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && <div className="alert alert-error text-sm">{error}</div>}
      {success && <div className="alert alert-success text-sm">{success}</div>}

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_360px]">
        <section className="card bg-base-100 p-4 shadow" data-testid="industries-list-card">
          <form
            className="mb-4 flex flex-wrap items-end gap-2 border-b border-base-300 pb-4"
            onSubmit={(e) => {
              e.preventDefault();
              setSearchQuery(searchInput.trim());
              setPage(1);
            }}
          >
            <label className="form-control flex-1">
              <div className="label pb-1">
                <span className="label-text">Search industries</span>
              </div>
              <input
                className="input input-bordered"
                placeholder="Type name and press Search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </label>
            <button className="btn btn-primary" type="submit">
              Search
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearchQuery("");
                setPage(1);
              }}
            >
              Reset
            </button>
          </form>

          {loading ? (
            <div className="py-8 text-center text-sm opacity-70">Loading industries...</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm opacity-70">No industries found.</div>
          ) : (
            <div
              className="max-h-[calc(100dvh-16rem)] min-h-0 overflow-y-auto overflow-x-auto"
              data-testid="industries-table-scroll"
            >
              <table className="table table-zebra">
                <thead>
                  <tr>
                    <th className="w-64">Name</th>
                    <th>Description</th>
                    <th className="w-40 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((industry) => {
                    const isEditing = editingId === industry.id;
                    return (
                      <tr key={industry.id}>
                        <td>
                          {isEditing ? (
                            <input
                              className="input input-bordered input-sm w-full"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                            />
                          ) : (
                            <span className="font-medium">{industry.name}</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <textarea
                              className="textarea textarea-bordered textarea-sm w-full"
                              rows={2}
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                            />
                          ) : (
                            <p className="text-sm opacity-80">{industry.description || "-"}</p>
                          )}
                        </td>
                        <td>
                          <div className="flex justify-end gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-xs"
                                  disabled={savingId === industry.id}
                                  onClick={() => void saveEdit(industry.id)}
                                >
                                  {savingId === industry.id ? "Saving..." : "Save"}
                                </button>
                                <button type="button" className="btn btn-ghost btn-xs" onClick={cancelEdit}>
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="btn btn-outline btn-xs" onClick={() => startEdit(industry)}>
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-error btn-outline btn-xs"
                                  disabled={deletingId === industry.id}
                                  onClick={() => {
                                    setDeleteTarget(industry);
                                    setDeleteError(null);
                                    setError(null);
                                    setSuccess(null);
                                  }}
                                >
                                  {deletingId === industry.id ? "Deleting..." : "Delete"}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs opacity-70">
              Showing {rangeStart}-{rangeEnd} of {total}
              {searchQuery ? ` matching "${searchQuery}"` : ""}
            </p>
            <TablePagination page={page} hasNextPage={hasNextPage} onPageChange={setPage} disabled={loading} />
          </div>
        </section>

        <aside
          className="card sticky top-4 bg-base-100 p-4 shadow xl:self-start"
          data-testid="industries-create-panel"
        >
          <div className="tabs tabs-boxed mb-4 w-full">
            <button
              type="button"
              className={`tab flex-1 ${mode === "single" ? "tab-active" : ""}`}
              onClick={() => setMode("single")}
            >
              Single create
            </button>
            <button
              type="button"
              className={`tab flex-1 ${mode === "bulk" ? "tab-active" : ""}`}
              onClick={() => setMode("bulk")}
            >
              Bulk create
            </button>
          </div>

          {mode === "single" ? (
            <form className="space-y-3" onSubmit={onSingleSubmit}>
              <div className="form-control">
                <label className="label pb-1" htmlFor="industry-name">
                  <span className="label-text">Industry name</span>
                </label>
                <input
                  id="industry-name"
                  className="input input-bordered"
                  placeholder="e.g. FinTech"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-control">
                <label className="label pb-1" htmlFor="industry-description">
                  <span className="label-text">Description</span>
                </label>
                <textarea
                  id="industry-description"
                  className="textarea textarea-bordered"
                  placeholder="Short description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>
              <button className="btn btn-primary w-full" type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create industry"}
              </button>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={onBulkSubmit}>
              <div className="form-control">
                <label className="label pb-1" htmlFor="bulk-industries">
                  <span className="label-text">Bulk entries (one per line)</span>
                </label>
                <textarea
                  id="bulk-industries"
                  className="textarea textarea-bordered min-h-56"
                  placeholder={"FinTech|Finance + technology\nHealthTech|Healthcare products\nEdTech|Learning technology"}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
              </div>
              <p className="text-xs opacity-70">
                Format each line as <code>name|description</code>. Description is optional.
              </p>
              <button className="btn btn-primary w-full" type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create industries in bulk"}
              </button>
            </form>
          )}
        </aside>
      </div>
      <DestructiveConfirmModal
        open={deleteTarget != null}
        onClose={() => {
          if (deleteTarget && deletingId === deleteTarget.id) return;
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={() => {
          void removeIndustry();
        }}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : "Delete industry?"}
        confirmLabel="Delete industry"
        confirmingLabel="Deleting..."
        submitting={deleteTarget != null && deletingId === deleteTarget.id}
        error={deleteError}
      >
        <p>
          This permanently removes <strong>{deleteTarget?.name ?? "this industry"}</strong> from the industry taxonomy.
          This cannot be undone.
        </p>
        <p className="opacity-80">Company records and filters may no longer show this label after deletion.</p>
      </DestructiveConfirmModal>
    </div>
  );
};
