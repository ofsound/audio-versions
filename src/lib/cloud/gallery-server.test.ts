import { beforeEach, describe, expect, it, vi } from "vitest";
import { isOwnedGalleryPath } from "./gallery-path";
import { handleGalleryMediaRequest, ownedGalleryPaths } from "./gallery-server";

const mocks = vi.hoisted(() => ({
	authenticate: vi.fn(),
	from: vi.fn(),
	del: vi.fn(),
	sign: vi.fn(),
	presign: vi.fn(),
}));
vi.mock("./supabase-server", () => ({
	authenticateRequest: mocks.authenticate,
}));
vi.mock("@vercel/blob", () => ({
	del: mocks.del,
	issueSignedToken: mocks.sign,
	presignUrl: mocks.presign,
}));
const songId = "11111111-1111-4111-8111-111111111111";
const imageId = "22222222-2222-4222-8222-222222222222";
const audioFileId = "33333333-3333-4333-8333-333333333333";
const path = `users/owner/images/${imageId}/original.png`;
const thumb = `users/owner/images/${imageId}/thumbnail.webp`;
const image = {
	id: imageId,
	remoteMedia: { pathname: path },
	thumbnailMedia: { pathname: thumb },
};
function query(data: unknown, error: unknown = null) {
	const result = { data, error };
	const chain = Object.assign(Promise.resolve(result), {
		select: vi.fn(),
		eq: vi.fn(),
		is: vi.fn(),
		maybeSingle: vi.fn().mockResolvedValue(result),
	});
	chain.select.mockReturnValue(chain);
	chain.eq.mockReturnValue(chain);
	chain.is.mockReturnValue(chain);
	return chain;
}
function send(body: unknown) {
	return handleGalleryMediaRequest(
		new Request("https://example.com/api/blob/gallery", {
			method: "POST",
			body: JSON.stringify(body),
		}),
	);
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.authenticate.mockResolvedValue({
		user: { id: "owner" },
		client: { from: mocks.from },
	});
	mocks.sign.mockResolvedValue("token");
	mocks.presign.mockResolvedValue({
		presignedUrl: "https://private.example/image",
	});
});
describe("private galleries", () => {
	it("signs only the selected variant after authorizing both parents", async () => {
		const song = query({ gallery_images: [] });
		const file = query({ gallery_images: [image] });
		mocks.from.mockReturnValueOnce(song).mockReturnValueOnce(file);
		const response = await send({
			action: "url",
			songId,
			audioFileId,
			imageId,
			thumbnail: true,
		});
		expect(response.status).toBe(200);
		expect(song.eq).toHaveBeenCalledWith("user_id", "owner");
		expect(file.eq).toHaveBeenCalledWith("song_id", songId);
		expect(file.eq).toHaveBeenCalledWith("user_id", "owner");
		expect(mocks.sign).toHaveBeenCalledWith(
			expect.objectContaining({ pathname: thumb, operations: ["get"] }),
		);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
	});
	it("does not issue media links for inaccessible parents or foreign paths", async () => {
		mocks.from.mockReturnValueOnce(query(null));
		expect((await send({ action: "url", songId, imageId })).status).toBe(404);
		mocks.from.mockReturnValueOnce(
			query({
				gallery_images: [
					{
						...image,
						remoteMedia: { pathname: path.replace("owner", "other") },
					},
				],
			}),
		);
		expect((await send({ action: "url", songId, imageId })).status).toBe(404);
		expect(mocks.sign).not.toHaveBeenCalled();
	});
	it("restricts interrupted-upload cleanup to valid owned image paths", async () => {
		for (const pathname of [
			path.replace("owner", "other"),
			"users/owner/audio/track.wav",
			`users/owner/images/${imageId}/../secret`,
			`users/owner/images/${imageId}/..`,
		]) {
			expect(isOwnedGalleryPath(pathname, "owner")).toBe(false);
			expect((await send({ action: "delete", pathname })).status).toBe(403);
		}
		expect(mocks.del).not.toHaveBeenCalled();
		expect((await send({ action: "delete", pathname: path })).status).toBe(200);
		expect(mocks.del).toHaveBeenCalledWith(path);
	});
	it("cleans song and file images together on permanent deletion", async () => {
		mocks.from
			.mockReturnValueOnce(query({ gallery_images: [image] }))
			.mockReturnValueOnce(
				query([
					{
						gallery_images: [
							{
								...image,
								remoteMedia: { pathname: path.replace("original", "file") },
							},
						],
					},
				]),
			);
		expect((await send({ action: "delete-song", songId })).status).toBe(200);
		expect(mocks.del).toHaveBeenCalledWith(path);
		expect(mocks.del).toHaveBeenCalledWith(path.replace("original", "file"));
		expect(
			ownedGalleryPaths(
				[null, { remoteMedia: { pathname: "users/other/audio/a.wav" } }],
				"owner",
			),
		).toEqual([]);
	});
	it("rejects malformed bodies before looking up records", async () => {
		expect((await send({ action: "url", songId: "bad", imageId })).status).toBe(
			400,
		);
		expect(
			(
				await handleGalleryMediaRequest(
					new Request("https://example.com", { method: "POST", body: "{" }),
				)
			).status,
		).toBe(400);
		expect(mocks.from).not.toHaveBeenCalled();
	});
});
