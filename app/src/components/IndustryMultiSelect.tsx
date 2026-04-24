import { useId, useMemo } from "react";

import type { Industry } from "../types";

type Props = {
  selectedIndustries: Industry[];
  options: Industry[];
  value: string[];
  onChange: (ids: string[]) => void;
  search: string;
  onSearchChange: (value: string) => void;
  loading?: boolean;
  disabled?: boolean;
};

const mergeIndustries = (...groups: Industry[][]): Industry[] => {
  const seen = new Set<string>();
  const merged: Industry[] = [];
  for (const group of groups) {
    for (const industry of group) {
      if (seen.has(industry.id)) continue;
      seen.add(industry.id);
      merged.push(industry);
    }
  }
  return merged;
};

/** Bounded server-backed industry picker; persists `value` as industry IDs for the API. */
export function IndustryMultiSelect({
  selectedIndustries,
  options,
  value,
  onChange,
  search,
  onSearchChange,
  loading,
  disabled
}: Props) {
  const baseId = useId();
  const industryById = useMemo(() => {
    const m = new Map<string, Industry>();
    mergeIndustries(selectedIndustries, options).forEach((industry) => m.set(industry.id, industry));
    return m;
  }, [options, selectedIndustries]);

  const visibleOptions = useMemo(
    () => options.filter((industry) => !value.includes(industry.id)),
    [options, value]
  );

  const remove = (id: string) => {
    onChange(value.filter((x) => x !== id));
  };

  const add = (id: string) => {
    if (value.includes(id)) return;
    onChange([...value, id]);
    onSearchChange("");
  };

  const labelFor = (id: string) => industryById.get(id)?.name ?? "Unknown industry";
  const disabledSearch = disabled || loading;

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

      <div className="space-y-2">
        <input
          id={`${baseId}-search`}
          type="search"
          autoComplete="off"
          className="input input-bordered w-full"
          disabled={disabledSearch}
          placeholder="Search industries to add..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && visibleOptions[0]) {
              e.preventDefault();
              add(visibleOptions[0].id);
            }
          }}
          aria-label="Search industries"
          aria-controls={`${baseId}-listbox`}
        />
        <div className="rounded-lg border border-base-300 bg-base-100">
          {loading ? (
            <p className="p-3 text-sm opacity-70">Loading industries...</p>
          ) : visibleOptions.length === 0 ? (
            <p className="p-3 text-sm opacity-70">No matching industries.</p>
          ) : (
            <ul id={`${baseId}-listbox`} role="listbox" className="max-h-52 overflow-auto py-1">
              {visibleOptions.map((industry) => (
                <li key={industry.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    className="flex w-full px-3 py-2 text-left text-sm hover:bg-base-200"
                    disabled={disabled}
                    onClick={() => add(industry.id)}
                  >
                    {industry.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="text-xs opacity-70">
        Search shows a bounded list of matching industries. Selected industries stay visible even outside current search.
      </p>
    </div>
  );
}
