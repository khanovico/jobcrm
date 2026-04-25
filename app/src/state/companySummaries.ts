import { api } from "../api";
import type { CompanyListItem } from "../types";

const CACHE_TTL_MS = 30 * 1000;
const ALL_COMPANIES_PAGE_SIZE = 200;

type CachedCompanyPage = {
  items: CompanyListItem[];
  fetchedAt: number;
};

const companyPages = new Map<string, CachedCompanyPage>();
let allCompaniesCache: CachedCompanyPage | null = null;
let allCompaniesPromise: Promise<CompanyListItem[]> | null = null;

const isFresh = (fetchedAt: number) => Date.now() - fetchedAt < CACHE_TTL_MS;

const pageKey = (page: number, pageSize: number, queryFingerprint: string) =>
  `${page}:${pageSize}:${queryFingerprint}`;

export const invalidateCompanySummariesCache = () => {
  companyPages.clear();
  allCompaniesCache = null;
  allCompaniesPromise = null;
};

export const resetCompanySummariesCacheForTests = () => {
  invalidateCompanySummariesCache();
};

export const getCompanySummariesPage = async (options: {
  page: number;
  pageSize: number;
  force?: boolean;
  /** Extra query params (sort, filters); included in cache key */
  extraParams?: URLSearchParams;
}): Promise<CompanyListItem[]> => {
  const fingerprint = options.extraParams?.toString() ?? "";
  const key = pageKey(options.page, options.pageSize, fingerprint);
  const cached = companyPages.get(key);
  if (!options.force && cached && isFresh(cached.fetchedAt)) {
    return cached.items;
  }

  const params = new URLSearchParams({
    skip: String((options.page - 1) * options.pageSize),
    limit: String(options.pageSize + 1)
  });
  if (options.extraParams) {
    options.extraParams.forEach((value, name) => {
      params.set(name, value);
    });
  }
  const items = await api.listCompanySummaries(params);
  companyPages.set(key, { items, fetchedAt: Date.now() });
  return items;
};

const fetchAllCompanySummaries = async (): Promise<CompanyListItem[]> => {
  const items: CompanyListItem[] = [];
  for (let page = 0; ; page += 1) {
    const batch = await api.listCompanySummaries(
      new URLSearchParams({
        skip: String(page * ALL_COMPANIES_PAGE_SIZE),
        limit: String(ALL_COMPANIES_PAGE_SIZE)
      })
    );
    items.push(...batch);
    if (batch.length < ALL_COMPANIES_PAGE_SIZE) {
      break;
    }
  }
  const sorted = items.sort((left, right) => left.name.localeCompare(right.name));
  allCompaniesCache = { items: sorted, fetchedAt: Date.now() };
  return sorted;
};

export const getAllCompanySummaries = async (options?: { force?: boolean }): Promise<CompanyListItem[]> => {
  if (!options?.force && allCompaniesCache && isFresh(allCompaniesCache.fetchedAt)) {
    return allCompaniesCache.items;
  }
  if (!options?.force && allCompaniesPromise) {
    return allCompaniesPromise;
  }

  const request = fetchAllCompanySummaries();
  allCompaniesPromise = request.finally(() => {
    allCompaniesPromise = null;
  });
  return allCompaniesPromise;
};
