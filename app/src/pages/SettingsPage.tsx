import { FormEvent, useEffect, useState } from "react";

import { api } from "../api";
import { Modal } from "../components/Modal";
import { AgentApiKeyCreated, UserPublic, WorkerStateResponse, WorkerType } from "../types";

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
  const [workerState, setWorkerState] = useState<WorkerStateResponse | null>(null);
  const [workerBusy, setWorkerBusy] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [maxResearcher, setMaxResearcher] = useState("");
  const [maxPpa, setMaxPpa] = useState("");
  const [maxDrafter, setMaxDrafter] = useState("");
  const [pendingWorkerRelease, setPendingWorkerRelease] = useState<WorkerType | null>(null);
  const [keyAcknowledged, setKeyAcknowledged] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w = await api.getWorkerState();
        if (!cancelled) {
          setWorkerState(w);
          setMaxResearcher(String(w.settings.max_company_researcher));
          setMaxPpa(String(w.settings.max_ppa_analyser));
          setMaxDrafter(String(w.settings.max_application_drafter));
        }
      } catch {
        if (!cancelled) setWorkerState(null);
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
      if (createdKey && !keyAcknowledged) {
        setSubmitError("Acknowledge or copy the current key before creating another key.");
        return;
      }
      const result = await api.createAgentApiKey({ name, scopes });
      setCreatedKey(result);
      setKeyName("");
      setKeyAcknowledged(false);
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
      setKeyAcknowledged(true);
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

  const saveWorkerMax = async () => {
    setWorkerError(null);
    setWorkerBusy(true);
    try {
      const parsed = {
        max_company_researcher: Number(maxResearcher),
        max_ppa_analyser: Number(maxPpa),
        max_application_drafter: Number(maxDrafter)
      };
      if (Object.values(parsed).some((n) => Number.isNaN(n) || n < 0 || n > 100)) {
        setWorkerError("Max workers must be numbers between 0 and 100.");
        return;
      }
      const w = await api.patchWorkerSettings(parsed);
      setWorkerState(await api.getWorkerState());
      setMaxResearcher(String(w.max_company_researcher));
      setMaxPpa(String(w.max_ppa_analyser));
      setMaxDrafter(String(w.max_application_drafter));
    } catch (e) {
      setWorkerError((e as Error).message);
    } finally {
      setWorkerBusy(false);
    }
  };

  const releaseWorkers = async (t: WorkerType) => {
    setWorkerError(null);
    setWorkerBusy(true);
    try {
      await api.releaseAllWorkers(t);
      setWorkerState(await api.getWorkerState());
    } catch (e) {
      setWorkerError((e as Error).message);
    } finally {
      setWorkerBusy(false);
    }
  };

  const workerTypeLabel: Record<WorkerType, string> = {
    company_researcher: "company researcher",
    ppa_analyser: "PPA analyser",
    application_drafter: "application drafter"
  };

  const getWorkerActiveCount = (workerType: WorkerType) => workerState?.active[workerType] ?? 0;

  const pendingWorkerActiveCount = pendingWorkerRelease ? getWorkerActiveCount(pendingWorkerRelease) : 0;
  const keyNeedsAcknowledgement = !!createdKey && !keyAcknowledged;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-sm opacity-70">
          Signed in as <span className="font-medium text-base-content">{user.email}</span>
          {user.admin ? (
            <span className="badge badge-ghost badge-sm ml-2">Admin</span>
          ) : null}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <section className="card bg-base-100 p-4 shadow">
          <h3 className="mb-1 text-lg font-semibold">Worker concurrency</h3>
          <p className="mb-3 text-sm opacity-80">
            Limit concurrent agent workers per pipeline stage. Use release to clear stuck leases.
          </p>
          {workerError && <p className="mb-2 text-sm text-error">{workerError}</p>}
          {workerState && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="form-control w-full">
                  <span className="label-text text-xs">Max company researchers</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input input-bordered input-sm w-full"
                    value={maxResearcher}
                    onChange={(e) => setMaxResearcher(e.target.value)}
                  />
                  <span className="label-text-alt text-xs opacity-70">
                    Active: {workerState.active.company_researcher ?? 0}
                  </span>
                </label>
                <label className="form-control w-full">
                  <span className="label-text text-xs">Max PPA analysers</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input input-bordered input-sm w-full"
                    value={maxPpa}
                    onChange={(e) => setMaxPpa(e.target.value)}
                  />
                  <span className="label-text-alt text-xs opacity-70">
                    Active: {workerState.active.ppa_analyser ?? 0}
                  </span>
                </label>
                <label className="form-control w-full">
                  <span className="label-text text-xs">Max application drafters</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input input-bordered input-sm w-full"
                    value={maxDrafter}
                    onChange={(e) => setMaxDrafter(e.target.value)}
                  />
                  <span className="label-text-alt text-xs opacity-70">
                    Active: {workerState.active.application_drafter ?? 0}
                  </span>
                </label>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={workerBusy}
                onClick={() => void saveWorkerMax()}
              >
                Save limits
              </button>
              <div className="flex flex-col gap-1.5 border-t border-base-300 pt-3">
                <button
                  type="button"
                  className="btn btn-outline btn-warning btn-sm w-full justify-center sm:w-auto"
                  disabled={workerBusy || getWorkerActiveCount("company_researcher") === 0}
                  onClick={() => setPendingWorkerRelease("company_researcher")}
                >
                  Release company researcher workers
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-warning btn-sm w-full justify-center sm:w-auto"
                  disabled={workerBusy || getWorkerActiveCount("ppa_analyser") === 0}
                  onClick={() => setPendingWorkerRelease("ppa_analyser")}
                >
                  Release PPA analyser workers
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-warning btn-sm w-full justify-center sm:w-auto"
                  disabled={workerBusy || getWorkerActiveCount("application_drafter") === 0}
                  onClick={() => setPendingWorkerRelease("application_drafter")}
                >
                  Release application drafter workers
                </button>
              </div>
            </div>
          )}
          {!workerState && <p className="text-sm opacity-70">Loading worker settings…</p>}
        </section>

        <section className="card bg-base-100 p-4 shadow">
          <h3 className="mb-1 text-lg font-semibold">Agent API keys</h3>
          <p className="mb-3 text-sm opacity-80">
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
                <div className="alert alert-warning mb-3 text-sm">
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
                    <label className="label cursor-pointer justify-start gap-2 p-0">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={keyAcknowledged}
                        onChange={(e) => setKeyAcknowledged(e.target.checked)}
                      />
                      <span className="label-text text-xs">I copied and stored this key securely.</span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => setCreatedKey(null)}
                      disabled={keyNeedsAcknowledgement}
                    >
                      Dismiss
                    </button>
                    {keyNeedsAcknowledgement && (
                      <p className="text-xs opacity-90">
                        Acknowledge or copy this one-time key before dismissing it.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <form className="space-y-3" onSubmit={(e) => void onCreateKey(e)}>
                <label className="form-control w-full">
                  <span className="label-text">Key name</span>
                  <input
                    className="input input-bordered input-sm w-full"
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
                <button type="submit" className="btn btn-primary btn-sm" disabled={submitting || keyNeedsAcknowledgement}>
                  {submitting ? "Creating…" : "Create API key"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
      <Modal
        open={pendingWorkerRelease !== null}
        onClose={() => setPendingWorkerRelease(null)}
        title="Confirm worker release"
        size="md"
      >
        <div className="space-y-3">
          {pendingWorkerRelease && (
            <p className="text-sm leading-relaxed opacity-90">
              Release <strong>{workerTypeLabel[pendingWorkerRelease]}</strong> workers? This will clear
              <strong> {pendingWorkerActiveCount}</strong> active lease
              {pendingWorkerActiveCount === 1 ? "" : "s"} now.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setPendingWorkerRelease(null)}
              disabled={workerBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-warning"
              disabled={workerBusy || !pendingWorkerRelease || pendingWorkerActiveCount === 0}
              onClick={() => {
                if (!pendingWorkerRelease) return;
                void releaseWorkers(pendingWorkerRelease);
                setPendingWorkerRelease(null);
              }}
            >
              {workerBusy ? "Releasing…" : "Release workers"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
