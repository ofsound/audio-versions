const ALLOWED_ORIGINS = new Set([
	"http://127.0.0.1:3000",
	"http://127.0.0.1:31415",
	"http://localhost:3000",
	"https://song-mode.vercel.app",
]);

export function cloudCorsHeaders(request: Request): HeadersInit {
	const origin = request.headers.get("origin");
	if (!origin || !ALLOWED_ORIGINS.has(origin)) {
		return {};
	}

	return {
		"Access-Control-Allow-Headers": "authorization, content-type",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Origin": origin,
		Vary: "Origin",
	};
}

export function cloudCorsPreflight(request: Request): Response {
	return new Response(null, {
		status: 204,
		headers: cloudCorsHeaders(request),
	});
}
