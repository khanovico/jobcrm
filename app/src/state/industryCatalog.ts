import { api } from "../api";
import type { Industry } from "../types";

const CACHE_TTL_MS = 5 * 60 * 1000;
const INDUSTRY_PAGE_SIZE = 200;

type CachedIndustryCatalog = {
  items: Industry[];
  fetchedAt: number;
};

let industryCatalogCache: CachedIndustryCatalog | null = null;
let industryCatalogPromise: Promise<Industry[]> | null = null;

const isFresh = (fetchedAt: number) => Date.now() - fetchedAt < CACHE_TTL_MS;

export const invalidateIndustryCatalogCache = () => {
  industryCatalogCache = null;
  industryCatalogPromise = null;
};

export const resetIndustryCatalogCacheForTests = () => {
  invalidateIndustryCatalogCache();
};

const fetchAllIndustries = async (): Promise<Industry[]> => {
  const items: Industry[] = [];
  for (let page = 0; ; page += 1) {
    const batch = await api.listIndustries(
      new URLSearchParams({
        skip: String(page * INDUSTRY_PAGE_SIZE),
        limit: String(INDUSTRY_PAGE_SIZE)
      })
    );
    items.push(...batch);
    if (batch.length < INDUSTRY_PAGE_SIZE) {
      break;
    }
  }
  const sorted = items.sort((left, right) => left.name.localeCompare(right.name));
  industryCatalogCache = { items: sorted, fetchedAt: Date.now() };
  return sorted;
};

export const getAllIndustries = async (options?: { force?: boolean }): Promise<Industry[]> => {
  if (!options?.force && industryCatalogCache && isFresh(industryCatalogCache.fetchedAt)) {
    return industryCatalogCache.items;
  }
  if (!options?.force && industryCatalogPromise) {
    return industryCatalogPromise;
  }

  const request = fetchAllIndustries();
  industryCatalogPromise = request.finally(() => {
    industryCatalogPromise = null;
  });
  return industryCatalogPromise;
};
