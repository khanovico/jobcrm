import { api } from "../api";
import type { WorkerStateResponse } from "../types";

const WORKER_SUMMARY_TTL_MS = 30 * 1000;

let cachedWorkerSummary: { value: WorkerStateResponse | null; fetchedAt: number } | null = null;
let workerSummaryPromise: Promise<WorkerStateResponse | null> | null = null;

const isFresh = (fetchedAt: number) => Date.now() - fetchedAt < WORKER_SUMMARY_TTL_MS;

export const invalidateWorkerSummaryCache = () => {
  cachedWorkerSummary = null;
  workerSummaryPromise = null;
};

export const resetWorkerSummaryCacheForTests = () => {
  invalidateWorkerSummaryCache();
};

export const getWorkerSummaryCached = async (options?: { force?: boolean }): Promise<WorkerStateResponse | null> => {
  if (!options?.force && cachedWorkerSummary && isFresh(cachedWorkerSummary.fetchedAt)) {
    return cachedWorkerSummary.value;
  }
  if (workerSummaryPromise) {
    return workerSummaryPromise;
  }

  workerSummaryPromise = api
    .getWorkerSummary()
    .catch(() => null)
    .then((value) => {
      cachedWorkerSummary = { value, fetchedAt: Date.now() };
      return value;
    })
    .finally(() => {
      workerSummaryPromise = null;
    });
  return workerSummaryPromise;
};
