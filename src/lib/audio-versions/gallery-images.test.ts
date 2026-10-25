// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { galleryImageContentType, prepareGalleryImage } from "./gallery-images";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
describe("gallery image preparation", () => {
	it("keeps the original bytes and makes a bounded thumbnail", async () => {
		const bitmap = { width: 1600, height: 1200, close: vi.fn() };
		vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
		const draw = vi.fn();
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			drawImage: draw,
		} as unknown as CanvasRenderingContext2D);
		const preview = new Blob(["preview"], { type: "image/webp" });
		vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
			function (this: HTMLCanvasElement, callback) {
				expect(this.width).toBe(267);
				expect(this.height).toBe(200);
				callback(preview);
			},
		);
		const file = new File(["original bytes"], "Mastering.PNG");
		const result = await prepareGalleryImage(file);
		expect(result.original.size).toBe(file.size);
		expect(result.original.type).toBe("image/png");
		expect(result.image).toMatchObject({
			name: file.name,
			width: 1600,
			height: 1200,
			size: file.size,
		});
		expect(result.thumbnail).toBe(preview);
		expect(bitmap.close).toHaveBeenCalled();
	});
	it("rejects unsupported formats, empty files and excessive dimensions", async () => {
		expect(
			galleryImageContentType(
				new File(["x"], "vector.svg", { type: "image/svg+xml" }),
			),
		).toBeNull();
		await expect(
			prepareGalleryImage(new File([], "empty.png")),
		).rejects.toThrow("25 MB");
		const close = vi.fn();
		vi.stubGlobal(
			"createImageBitmap",
			vi.fn().mockResolvedValue({ width: 10000, height: 10000, close }),
		);
		await expect(
			prepareGalleryImage(new File(["x"], "huge.png")),
		).rejects.toThrow("megapixels");
		expect(close).toHaveBeenCalled();
	});
});
