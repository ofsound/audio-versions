import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithSessionRetry } from "./session-fetch";

const url = "https://example.supabase.co/rest/v1/songs";
const clockError = () =>
	Response.json(
		{ code: "PGRST303", message: "JWT issued at future" },
		{ status: 401 },
	);

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("fetchWithSessionRetry", () => {
	it("replays a rejected write with its body and token intact", async () => {
		vi.useFakeTimers();
		const bodies: string[] = [];
		const tokens: (string | null)[] = [];
		const mock = vi.fn(async (request: Request) => {
			bodies.push(await request.text());
			tokens.push(request.headers.get("authorization"));
			return bodies.length === 1
				? clockError()
				: new Response(null, { status: 204 });
		});
		vi.stubGlobal("fetch", mock);
		const result = fetchWithSessionRetry(url, {
			method: "POST",
			headers: { authorization: "Bearer same-token" },
			body: JSON.stringify({ title: "Mix" }),
		});
		await vi.runAllTimersAsync();
		expect((await result).status).toBe(204);
		expect(bodies).toEqual(['{"title":"Mix"}', '{"title":"Mix"}']);
		expect(tokens).toEqual(["Bearer same-token", "Bearer same-token"]);
	});

	it("stops after three retries and preserves the final error body", async () => {
		vi.useFakeTimers();
		const mock = vi.fn(async () => clockError());
		vi.stubGlobal("fetch", mock);
		const result = fetchWithSessionRetry(new Request(url));
		await vi.runAllTimersAsync();
		expect(mock).toHaveBeenCalledTimes(4);
		expect(await (await result).json()).toEqual({
			code: "PGRST303",
			message: "JWT issued at future",
		});
	});

	it.each([
		[url, 401, { code: "PGRST303", message: "JWT expired" }],
		[url, 500, { code: "PGRST303", message: "JWT issued at future" }],
		[
			"https://example.supabase.co/auth/v1/token",
			401,
			{ code: "PGRST303", message: "JWT issued at future" },
		],
		[url, 401, { message: "JWT issued at future" }],
	])("does not retry other failures (%s, %s)", async (target, status, body) => {
		const response = Response.json(body, { status });
		const mock = vi.fn(async () => response);
		vi.stubGlobal("fetch", mock);
		expect(await fetchWithSessionRetry(target)).toBe(response);
		expect(mock).toHaveBeenCalledTimes(1);
		expect(await response.json()).toEqual(body);
	});

	it("cancels a pending retry when the request is aborted", async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const mock = vi.fn(async () => clockError());
		vi.stubGlobal("fetch", mock);
		const result = fetchWithSessionRetry(url, { signal: controller.signal });
		const assertion = expect(result).rejects.toMatchObject({
			name: "AbortError",
		});
		await vi.advanceTimersByTimeAsync(500);
		controller.abort();
		await assertion;
		await vi.runAllTimersAsync();
		expect(mock).toHaveBeenCalledTimes(1);
	});
});
