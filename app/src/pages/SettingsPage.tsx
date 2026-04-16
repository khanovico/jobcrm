import { FormEvent, useEffect, useState } from "react";

import { api } from "../api";
import { AgentApiKeyCreated, UserPublic } from "../types";

export const SettingsPage = () => {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("");
  const [scopeRead, setScopeRead] = useState(true);
  const [scopeWrite, setScopeWrite] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdKey, setCreatedKey] = useState<AgentApiKeyCreated | null>(null);
  const [copyDone, setCopyDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const me = await api.getMe();
        if (!cancelled) setUser(me);
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onCreateKey = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setCopyDone(false);
    const name = keyName.trim();
    if (!name) {
      setSubmitError("Enter a name for this key.");
      return;
    }
    const scopes: string[] = [];
    if (scopeRead) scopes.push("read");
    if (scopeWrite) scopes.push("write");
    if (scopes.length === 0) {
      setSubmitError("Select at least one scope (read and/or write).");
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.createAgentApiKey({ name, scopes });
      setCreatedKey(result);
      setKeyName("");
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyRawKey = async () => {
    if (!createdKey?.raw_key) return;
    try {
      await navigator.clipboard.writeText(createdKey.raw_key);
      setCopyDone(true);
    } catch {
      setSubmitError("Could not copy to clipboard.");
    }
  };

  if (loadError) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Settings</h2>
        <div className="alert alert-error text-sm">{loadError}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2 p-4">
        <span className="loading loading-spinner" />
        <span className="text-sm opacity-70">Loading…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-sm opacity-70">
          Signed in as <span className="font-medium text-base-content">{user.email}</span>
          {user.admin ? (
            <span className="badge badge-ghost badge-sm ml-2">Admin</span>
          ) : null}
        </p>
      </div>

      <section className="card bg-base-100 p-4 shadow">
        <h3 className="mb-1 text-lg font-semibold">Agent API keys</h3>
        <p className="mb-4 text-sm opacity-80">
          Keys authenticate the Job Application Agent (JAA) against the API using the <code className="text-xs">X-API-Key</code>{" "}
          header. Each new key is shown <strong>once</strong> — store it securely.
        </p>

        {!user.admin ? (
          <div className="alert alert-info text-sm">
            Only <strong>administrators</strong> can create agent API keys. Ask an admin to promote your account or create a key for
            you.
          </div>
        ) : (
          <>
            {createdKey && (
              <div className="alert alert-warning mb-4 text-sm">
                <div className="space-y-2">
                  <p>
                    Key <strong>{createdKey.name}</strong> created. Copy the secret below now — it will not be shown again.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      readOnly
                      className="input input-bordered input-sm w-full font-mono text-xs"
                      value={createdKey.raw_key}
                      aria-label="New API key"
                    />
                    <button type="button" className="btn btn-sm btn-outline shrink-0" onClick={() => void copyRawKey()}>
                      {copyDone ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCreatedKey(null)}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <form className="space-y-3" onSubmit={(e) => void onCreateKey(e)}>
              <label className="form-control w-full">
                <span className="label-text">Key name</span>
                <input
                  className="input input-bordered w-full"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g. production JAA, dev laptop"
                  required
                  autoComplete="off"
                />
              </label>
              <fieldset className="form-control">
                <legend className="label-text mb-1">Scopes</legend>
                <label className="label cursor-pointer justify-start gap-2">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={scopeRead}
                    onChange={(e) => setScopeRead(e.target.checked)}
                  />
                  <span className="label-text">read</span>
                </label>
                <label className="label cursor-pointer justify-start gap-2">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={scopeWrite}
                    onChange={(e) => setScopeWrite(e.target.checked)}
                  />
                  <span className="label-text">write</span>
                </label>
              </fieldset>
              {submitError && <p className="text-sm text-error">{submitError}</p>}
              <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                {submitting ? "Creating…" : "Create API key"}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
};
