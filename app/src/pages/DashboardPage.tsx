import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { ApplicationSearchSummary, DashboardMetrics, GlobalSearchResult } from "../types";

const metricCards: Array<{
  key: keyof DashboardMetrics;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
}> = [
  {
    key: "company_research_pipeline",
    title: "Company research pipeline",
    description: "Applications still waiting for company research coverage.",
    href: "/applications?workflow_filter=company_research",
    actionLabel: "Review research queue"
  },
  {
    key: "application_ready",
    title: "Application ready",
    description: "Prepared applications that are ready for action.",
    href: "/applications?status_filter=application_ready",
    actionLabel: "Open ready applications"
  },
  {
    key: "actions_need_review",
    title: "Actions to review",
    description: "Application work that needs a quick pass from you.",
    href: "/applications",
    actionLabel: "Review applications"
  },
  {
    key: "unread_notifications",
    title: "Unread notifications",
    description: "Recent updates from the product and agent workflows.",
    href: "/notifications",
    actionLabel: "Open notifications"
  }
];

const formatStatusLabel = (status: string) =>
  status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatUpdatedLabel = (value: string) => {
  if (!value) return "Unknown";
  const date = value.slice(0, 10);
  const time = value.length >= 16 ? value.slice(11, 16) : null;
  return time ? `${date} ${time} UTC` : date;
};

const hasSearchMatches = (searchResult: GlobalSearchResult | null) =>
  Boolean(
    searchResult &&
      (searchResult.companies.length > 0 ||
        searchResult.profiles.length > 0 ||
        searchResult.applications.length > 0)
  );

const ApplicationSearchRow = ({ application }: { application: ApplicationSearchSummary }) => (
  <li className="rounded-lg border border-base-300 p-3">
    <div className="flex flex-wrap items-center gap-2">
      <Link to={`/applications/${application.id}`} className="link link-primary font-semibold">
        {application.company_name}
      </Link>
      <span className="badge badge-outline">{formatStatusLabel(application.status)}</span>
    </div>
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-70">
      <span>Application {application.id.slice(0, 8)}</span>
      <span>Updated {formatUpdatedLabel(application.updated_at)}</span>
      <Link to={`/companies/${application.company_id}`} className="link link-hover">
        Company record
      </Link>
      {application.job_link && (
        <a
          className="link link-hover"
          href={application.job_link}
          target="_blank"
          rel="noreferrer"
        >
          Job post
        </a>
      )}
    </div>
    {(application.job_title || application.job_description_excerpt) && (
      <div className="mt-2 text-sm">
        {application.job_title && <div className="font-medium">{application.job_title}</div>}
        {application.job_description_excerpt && (
          <p className="mt-1 text-sm opacity-80">{application.job_description_excerpt}</p>
        )}
      </div>
    )}
  </li>
);

export const DashboardPage = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [q, setQ] = useState("");
  const [searchResult, setSearchResult] = useState<GlobalSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [lastSearchQuery, setLastSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const searchRequestSeq = useRef(0);

  useEffect(() => {
    void (async () => {
      try {
        setMetrics(await api.getDashboardMetrics());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const resultCount = useMemo(() => {
    if (!searchResult) return 0;
    return searchResult.companies.length + searchResult.profiles.length + searchResult.applications.length;
  }, [searchResult]);

  const onSearch = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedQuery = q.trim();
    setError(null);
    if (!trimmedQuery) {
      searchRequestSeq.current += 1;
      setLastSearchQuery("");
      setSearchResult(null);
      setIsSearching(false);
      return;
    }
    const requestSeq = searchRequestSeq.current + 1;
    searchRequestSeq.current = requestSeq;
    setIsSearching(true);
    setLastSearchQuery(trimmedQuery);
    try {
      const result = await api.globalSearch(trimmedQuery);
      if (requestSeq === searchRequestSeq.current) {
        setSearchResult(result);
      }
    } catch (e) {
      if (requestSeq === searchRequestSeq.current) {
        setError((e as Error).message);
      }
    } finally {
      if (requestSeq === searchRequestSeq.current) {
        setIsSearching(false);
      }
    }
  };

  const showResults = searchResult !== null;
  const hasMatches = hasSearchMatches(searchResult);

  return (
    <div className="space-y-6">
      {error && <div className="alert alert-error text-sm">{error}</div>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <div key={card.key} className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
            <p className="text-sm opacity-70">{card.title}</p>
            <p className="mt-2 text-3xl font-semibold">{metrics?.[card.key] ?? "—"}</p>
            <p className="mt-2 text-sm opacity-80">{card.description}</p>
            <Link to={card.href} className="link link-primary mt-3 inline-flex text-sm font-medium">
              {card.actionLabel}
            </Link>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Search</h2>
            <p className="mt-1 text-sm opacity-70">Jump from the dashboard into companies, profiles, and applications.</p>
          </div>
          {showResults && !isSearching && (
            <p className="text-sm opacity-70">
              {resultCount} match{resultCount === 1 ? "" : "es"}
            </p>
          )}
        </div>

        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={onSearch} aria-busy={isSearching}>
          <input
            aria-label="Search dashboard"
            className="input input-bordered flex-1"
            placeholder="Companies, profiles, job posts, application notes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className={`btn btn-primary ${isSearching ? "btn-disabled" : ""}`} disabled={isSearching}>
            {isSearching ? "Searching..." : "Search"}
          </button>
        </form>

        {isSearching && (
          <div className="mt-3 text-sm opacity-70" role="status">
            Searching across dashboard records...
          </div>
        )}

        {showResults && !isSearching && !hasMatches && (
          <div className="mt-4 rounded-lg border border-dashed border-base-300 px-4 py-6 text-sm opacity-80">
            No matches for "{lastSearchQuery}".
          </div>
        )}

        {showResults && !isSearching && hasMatches && searchResult && (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)]">
            <div>
              <h3 className="font-medium">Companies</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {searchResult.companies.map((company) => (
                  <li key={company.id}>
                    <Link to={`/companies/${company.id}`} className="link link-primary font-medium">
                      {company.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-medium">Profiles</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {searchResult.profiles.map((profile) => (
                  <li key={profile.id}>
                    <Link to={`/profiles/${profile.id}`} className="link link-primary font-medium">
                      {profile.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-medium">Applications</h3>
              <ul className="mt-2 space-y-3 text-sm">
                {searchResult.applications.map((application) => (
                  <ApplicationSearchRow key={application.id} application={application} />
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
