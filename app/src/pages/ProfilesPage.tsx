import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../api";
import { Profile } from "../types";

export const ProfilesPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setItems(await api.listProfiles());
    } catch (err) {
      setError((err as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <section className="card bg-base-100 p-4 shadow">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Profiles</h2>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
              Refresh
            </button>
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
          </div>
        </div>
        {error && <div className="alert alert-error mb-3 text-sm">{error}</div>}
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
                <th className="w-52 text-right">Actions</th>
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
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className={`btn btn-xs ${profile.frozen ? "btn-success btn-outline" : "btn-warning btn-outline"}`}
                        onClick={async (e) => {
                          e.stopPropagation();
                          const action = profile.frozen ? "Unfreeze" : "Freeze";
                          if (!window.confirm(`${action} profile "${profile.name}"?`)) return;
                          try {
                            await api.updateProfile(profile.id, { frozen: !profile.frozen });
                            await load();
                          } catch (err) {
                            setError((err as Error).message);
                          }
                        }}
                      >
                        {profile.frozen ? "Unfreeze" : "Freeze"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-error btn-outline"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm(`Delete profile "${profile.name}"?`)) return;
                          try {
                            await api.deleteProfile(profile.id);
                            await load();
                          } catch (err) {
                            setError((err as Error).message);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <p className="p-4 text-sm opacity-70">No profiles yet.</p>}
        </div>
        <p className="mt-2 text-xs opacity-60">Click a row to view and edit. Use + to create a profile (all fields except resume are required).</p>
      </section>
    </div>
  );
};
