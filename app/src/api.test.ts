import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiConflictError, setUnauthorizedHandler } from "./api";

const fetchMock = vi.fn();

const mockJsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: vi.fn().mockResolvedValue(body)
  }) as unknown as Response;

const mockErrorResponse = (status: number, body: string): Response =>
  ({
    ok: false,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    text: vi.fn().mockResolvedValue(body)
  }) as unknown as Response;

describe("api auth request handling", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    localStorage.clear();
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  it("sends Authorization header from localStorage token", async () => {
    localStorage.setItem("jobcrm-token", "token-123");
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ id: "u1", email: "demo@example.com" }));

    await api.getMe();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-123");
  });

  it("logs out via unauthorized handler and shows friendly session error on 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValueOnce(mockErrorResponse(401, '{"detail":"Missing token"}'));

    await expect(api.getMe()).rejects.toThrow("Session expired. Please sign in again.");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("extracts FastAPI detail message for non-401 responses", async () => {
    fetchMock.mockResolvedValueOnce(mockErrorResponse(400, '{"detail":"Invalid credentials"}'));

    await expect(api.login("demo@example.com", "bad-pass")).rejects.toThrow("Invalid credentials");
  });

  it("sends bulk delete body for deleteNotificationsBulk", async () => {
    localStorage.setItem("jobcrm-token", "t1");
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ deleted: 2 }));

    const out = await api.deleteNotificationsBulk(["a", "b"]);
    expect(out).toEqual({ deleted: 2 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/notifications");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBe(JSON.stringify({ ids: ["a", "b"] }));
  });
});
