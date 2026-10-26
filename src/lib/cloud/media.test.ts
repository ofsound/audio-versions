import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRemoteAudioUrl } from "./media";

vi.mock("./supabase", () => ({
	getSupabaseBrowserClient: () => ({
		auth: {
			getSession: async () => ({
				data: { session: { access_token: "test-token" } },
			}),
		},
	}),
}));

describe("private audio links", () => {
	const fetchMock = vi.fn();
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
		fetchMock.mockReset().mockImplementation(async () =>
			Response.json({
				url: `https://media.example/link-${fetchMock.mock.calls.length}`,
				expiresAt: Date.now() + 60 * 60 * 1000,
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("reuses a valid link and replaces it after an hour idle", async () => {
		expect(await getRemoteAudioUrl("idle-file")).toBe(
			"https://media.example/link-1",
		);
		expect(await getRemoteAudioUrl("idle-file")).toBe(
			"https://media.example/link-1",
		);
		expect(fetchMock).toHaveBeenCalledOnce();
		vi.advanceTimersByTime(60 * 60 * 1000);
		expect(await getRemoteAudioUrl("idle-file")).toBe(
			"https://media.example/link-2",
		);
	});

	it("can replace a rejected link even before its recorded expiration", async () => {
		await getRemoteAudioUrl("rejected-file");
		expect(await getRemoteAudioUrl("rejected-file", true)).toBe(
			"https://media.example/link-2",
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
