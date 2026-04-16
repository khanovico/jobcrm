import { useId, useMemo, useState } from "react";

import type { Industry } from "../types";

type Props = {
  industries: Industry[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

/** Multi-select industries by name; persists `value` as industry IDs for the API. */
export function IndustryMultiSelect({ industries, value, onChange, disabled }: Props) {
  const baseId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const byId = useMemo(() => {
    const m = new Map<string, Industry>();
    industries.forEach((i) => m.set(i.id, i));
    return m;
  }, [industries]);

  const unselected = useMemo(
    () => industries.filter((i) => !value.includes(i.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [industries, value]
  );

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return unselected;
    return unselected.filter((i) => i.name.toLowerCase().includes(q));
  }, [unselected, query]);

  const remove = (id: string) => {
    onChange(value.filter((x) => x !== id));
  };

  const add = (id: string) => {
    if (value.includes(id)) return;
    onChange([...value, id]);
    setQuery("");
    setOpen(false);
  };

  const labelFor = (id: string) => byId.get(id)?.name ?? "Unknown industry";

  const showList = open && suggestions.length > 0 && !disabled;

  return (
    <div className="space-y-2">
      <div
        className="flex min-h-[2.75rem] flex-wrap gap-2 rounded-lg border border-base-300 bg-base-200/50 p-2"
        aria-label="Selected industries"
      >
        {value.length === 0 ? (
          <span className="self-center text-sm opacity-60">No industries selected</span>
        ) : (
          value.map((id) => (
            <span key={id} className="badge badge-lg badge-outline gap-0 pr-0">
              <span className="pl-1">{labelFor(id)}</span>
              <button
                type="button"
                className="btn btn-ghost btn-xs min-h-0 px-2"
                disabled={disabled}
                onClick={() => remove(id)}
                aria-label={`Remove ${labelFor(id)}`}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
        <select
          className="select select-bordered w-full lg:max-w-xs lg:flex-shrink-0"
          disabled={disabled || unselected.length === 0}
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (id) add(id);
          }}
          aria-label="Add industry from dropdown"
        >
          <option value="">Add industry…</option>
          {unselected.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>

        <div className="relative min-w-0 flex-1">
          <input
            id={`${baseId}-search`}
            type="search"
            autoComplete="off"
            className="input input-bordered w-full"
            disabled={disabled || unselected.length === 0}
            placeholder={unselected.length === 0 ? "All listed industries are selected" : "Type to filter industries…"}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 180);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions[0]) {
                e.preventDefault();
                add(suggestions[0].id);
              }
              if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={`${baseId}-listbox`}
          />
          {showList ? (
            <ul
              id={`${baseId}-listbox`}
              role="listbox"
              className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-base-300 bg-base-100 py-1 shadow-lg"
            >
              {suggestions.map((i) => (
                <li key={i.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    className="flex w-full px-3 py-2 text-left text-sm hover:bg-base-200"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(i.id)}
                  >
                    {i.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <p className="text-xs opacity-70">
        Choose from the list or search by name. Names come from the Industries page; the company stores industry IDs.
      </p>
    </div>
  );
}
