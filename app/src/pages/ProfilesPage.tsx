import { FormEvent, useEffect, useState } from "react";

import { api } from "../api";
import { Profile } from "../types";

export const ProfilesPage = () => {
  const [items, setItems] = useState<Profile[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Profile | null>(null);

  const load = async () => setItems(await api.listProfiles());
  useEffect(() => {
    void load();
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (selected) {
      await api.updateProfile(selected.id, { name, email });
    } else {
      await api.createProfile({ name, email });
    }
    setSelected(null);
    setName("");
    setEmail("");
    await load();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card bg-base-100 p-4 shadow">
        <h2 className="mb-2 text-xl font-semibold">Profiles</h2>
        <ul className="space-y-2">
          {items.map((profile) => (
            <li key={profile.id} className="flex items-center justify-between rounded border p-2">
              <div>
                <div className="font-medium">{profile.name}</div>
                <div className="text-xs">{profile.email}</div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-xs"
                  onClick={() => {
                    setSelected(profile);
                    setName(profile.name);
                    setEmail(profile.email ?? "");
                  }}
                >
                  Edit
                </button>
                <button
                  className="btn btn-xs btn-error"
                  onClick={async () => {
                    await api.deleteProfile(profile.id);
                    await load();
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="card bg-base-100 p-4 shadow">
        <h2 className="mb-2 text-xl font-semibold">{selected ? "Edit Profile" : "New Profile"}</h2>
        <form className="space-y-2" onSubmit={onSubmit}>
          <input
            className="input input-bordered w-full"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="input input-bordered w-full"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn btn-primary">{selected ? "Update" : "Create"}</button>
        </form>
      </section>
    </div>
  );
};
