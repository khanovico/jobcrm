import { api } from "../api";
import type { Company } from "../types";

const CACHE_TTL_MS = 5 * 60 * 1000;
const ALL_COMPANIES_PAGE_SIZE = 200;

type CachedCompanyPage = {
  items: Company[];
  fetchedAt: number;
};

const companyPages = new Map<string, CachedCompanyPage>();
let allCompaniesCache: CachedCompanyPage | null = null;
let allCompaniesPromise: Promise<Company[]> | null = null;

const isFresh = (fetchedAt: number) => Date.now() - fetchedAt < CACHE_TTL_MS;

const pageKey = (page: number, pageSize: number) => `${page}:${pageSize}`;

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
}): Promise<Company[]> => {
  const key = pageKey(options.page, options.pageSize);
  const cached = companyPages.get(key);
  if (!options.force && cached && isFresh(cached.fetchedAt)) {
    return cached.items;
  }

  const params = new URLSearchParams({
    skip: String((options.page - 1) * options.pageSize),
    limit: String(options.pageSize)
  });
  const items = await api.listCompanies(params);
  companyPages.set(key, { items, fetchedAt: Date.now() });
  return items;
};

const fetchAllCompanySummaries = async (): Promise<Company[]> => {
  const items: Company[] = [];
  for (let page = 0; ; page += 1) {
    const batch = await api.listCompanies(
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

export const getAllCompanySummaries = async (options?: { force?: boolean }): Promise<Company[]> => {
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
