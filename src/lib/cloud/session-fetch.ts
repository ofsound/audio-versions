// A freshly refreshed token can briefly be ahead of the database server's clock.
// Retry only explicit pre-query JWT rejections, so writes cannot be duplicated.
export const fetchWithSessionRetry: typeof fetch = async (input, init) => {
	const request = new Request(input, init);
	if (!new URL(request.url).pathname.startsWith("/rest/v1/")) {
		return fetch(request);
	}

	const delays = [1000, 2000, 4000];
	for (let attempt = 0; ; attempt += 1) {
		request.signal.throwIfAborted();
		const response = await fetch(request.clone());
		const delay = delays[attempt];
		if (response.status !== 401 || delay === undefined) {
			return response;
		}

		const error = await response
			.clone()
			.json()
			.catch(() => null);
		if (
			error?.code !== "PGRST303" ||
			!/^JWT issued at future$/i.test(error?.message ?? "")
		) {
			return response;
		}

		await new Promise<void>((resolve, reject) => {
			const onAbort = () => {
				clearTimeout(timer);
				reject(request.signal.reason);
			};
			const timer = setTimeout(() => {
				request.signal.removeEventListener("abort", onAbort);
				resolve();
			}, delay);
			request.signal.addEventListener("abort", onAbort, { once: true });
			if (request.signal.aborted) onAbort();
		});
	}
};
