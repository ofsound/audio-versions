export function isOwnedGalleryPath(
	pathname: unknown,
	userId: string,
): pathname is string {
	if (typeof pathname !== "string") return false;
	const prefix = `users/${userId}/images/`;
	if (!pathname.startsWith(prefix)) return false;
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/i.test(
		pathname.slice(prefix.length),
	);
}
