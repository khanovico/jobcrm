import { api } from "../api";
import type { IndustryOptionsResponse } from "../types";

const DEFAULT_OPTION_LIMIT = 20;

export const invalidateIndustryCatalogCache = () => {
  // Industry pickers now use bounded server-backed options instead of a full cached catalog.
};

export const resetIndustryCatalogCacheForTests = () => {
  invalidateIndustryCatalogCache();
};

export const getIndustryOptions = async (options?: {
  ids?: string[];
  search?: string;
  limit?: number;
}): Promise<IndustryOptionsResponse> => {
  const params = new URLSearchParams();
  for (const id of options?.ids ?? []) {
    params.append("ids", id);
  }
  const search = options?.search?.trim();
  if (search) {
    params.set("search", search);
  }
  params.set("limit", String(options?.limit ?? DEFAULT_OPTION_LIMIT));
  return api.listIndustryOptions(params);
};

export const getIndustryCount = async (search?: string): Promise<number> => {
  const params = new URLSearchParams();
  const query = search?.trim();
  if (query) {
    params.set("search", query);
  }
  const response = await api.countIndustries(params);
  return response.total;
};
