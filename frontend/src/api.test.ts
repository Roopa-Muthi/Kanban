import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, authApi, formatError, setSessionExpiredHandler, tokenStore } from "./api";

function fakeResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

describe("formatError", () => {
  it("joins DRF field errors into one sentence", () => {
    const err = new ApiError(400, { username: ["Taken."], password: ["Too short.", "Too common."] });
    expect(formatError(err)).toBe("Taken. Too short. Too common.");
  });

  it("reads a detail message", () => {
    expect(formatError(new ApiError(404, { detail: "Not found." }))).toBe("Not found.");
  });

  it("falls back to the status when the body is empty", () => {
    expect(formatError(new ApiError(500, null))).toBe("Request failed with status 500");
  });

  it("falls back when the body has no messages", () => {
    expect(formatError(new ApiError(400, {}))).toBe("Request failed with status 400");
  });

  it("explains network failures", () => {
    expect(formatError(new TypeError("Failed to fetch"))).toBe(
      "Cannot reach the server. Is the backend running?",
    );
  });

  it("handles anything else", () => {
    expect(formatError("boom")).toBe("Something went wrong.");
  });
});

describe("tokenStore", () => {
  it("stores, updates and clears tokens", () => {
    tokenStore.setTokens("a1", "r1");
    expect(tokenStore.getAccess()).toBe("a1");
    expect(tokenStore.getRefresh()).toBe("r1");
    tokenStore.setAccess("a2");
    expect(tokenStore.getAccess()).toBe("a2");
    tokenStore.clear();
    expect(tokenStore.getAccess()).toBeNull();
    expect(tokenStore.getRefresh()).toBeNull();
  });
});

describe("request", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSessionExpiredHandler(null);
  });

  it("refreshes an expired access token and retries once", async () => {
    tokenStore.setTokens("old-access", "refresh-1");
    fetchMock
      .mockResolvedValueOnce(fakeResponse(401, { detail: "expired" }))
      .mockResolvedValueOnce(fakeResponse(200, { access: "new-access" }))
      .mockResolvedValueOnce(fakeResponse(200, [{ id: 1 }]));

    const result = await api.get<{ id: number }[]>("/boards");

    expect(result).toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(tokenStore.getAccess()).toBe("new-access");
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer new-access",
    });
  });

  it("clears the session and notifies when the refresh token is dead", async () => {
    tokenStore.setTokens("old", "dead-refresh");
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    fetchMock
      .mockResolvedValueOnce(fakeResponse(401, { detail: "expired" }))
      .mockResolvedValueOnce(fakeResponse(401, { detail: "bad refresh" }));

    await expect(api.get("/boards")).rejects.toHaveProperty("status", 401);
    expect(tokenStore.getAccess()).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("doesn't try to refresh when a login fails", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(401, { detail: "No active account" }));
    await expect(authApi.login("a", "b")).rejects.toHaveProperty("status", 401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one refresh between simultaneous failing requests", async () => {
    tokenStore.setTokens("old", "r");
    fetchMock.mockImplementation((input) => {
      if (String(input).endsWith("/auth/refresh")) {
        return Promise.resolve(fakeResponse(200, { access: "new" }));
      }
      const status = tokenStore.getAccess() === "new" ? 200 : 401;
      return Promise.resolve(fakeResponse(status, { ok: true }));
    });

    await Promise.all([api.get("/a"), api.get("/b")]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
  });
});