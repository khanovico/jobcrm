import { FormEvent, useEffect, useState } from "react";

import { api } from "../api";
import { Industry } from "../types";

export const IndustriesPage = () => {
  const [items, setItems] = useState<Industry[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      setItems(await api.listIndustries());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createIndustry({ name, description });
      setName("");
      setDescription("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card bg-base-100 p-4 shadow">
        <h2 className="mb-2 text-xl font-semibold">Industries</h2>
        {error && <div className="alert alert-error mb-2 text-sm">{error}</div>}
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="rounded border border-base-300 p-2">
              <div className="font-medium">{i.name}</div>
              <p className="text-sm opacity-80">{i.description || "—"}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="card bg-base-100 p-4 shadow">
        <h2 className="mb-2 text-xl font-semibold">New industry</h2>
        <form className="space-y-2" onSubmit={onSubmit}>
          <input
            className="input input-bordered w-full"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <textarea
            className="textarea textarea-bordered w-full"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
          <button className="btn btn-primary" type="submit">
            Create
          </button>
        </form>
      </section>
    </div>
  );
};
