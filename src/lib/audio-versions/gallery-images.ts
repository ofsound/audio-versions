import type { GalleryImage } from "./types";

export const GALLERY_IMAGE_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"image/avif",
];
export const GALLERY_IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.avif";
export const MAX_GALLERY_IMAGE_SIZE = 25 * 1024 * 1024;

export function galleryImageContentType(file: File): string | null {
	if (GALLERY_IMAGE_TYPES.includes(file.type)) return file.type;
	if (file.type && file.type !== "application/octet-stream") return null;
	const extension = file.name.split(".").at(-1)?.toLowerCase();
	return (
		(
			{
				png: "image/png",
				jpg: "image/jpeg",
				jpeg: "image/jpeg",
				webp: "image/webp",
				gif: "image/gif",
				avif: "image/avif",
			} as Record<string, string>
		)[extension ?? ""] ?? null
	);
}

export async function prepareGalleryImage(
	file: File,
): Promise<{ image: GalleryImage; original: Blob; thumbnail: Blob }> {
	const contentType = galleryImageContentType(file);
	if (!contentType)
		throw new Error("Choose PNG, JPEG, WebP, GIF, or AVIF images.");
	if (!file.size || file.size > MAX_GALLERY_IMAGE_SIZE)
		throw new Error("Each image must be between 1 byte and 25 MB.");
	const original = file.slice(0, file.size, contentType);
	const bitmap = await createImageBitmap(original).catch(() => {
		throw new Error(`“${file.name}” could not be read as an image.`);
	});
	try {
		if (bitmap.width * bitmap.height > 50_000_000)
			throw new Error("Images must be smaller than 50 megapixels.");
		const scale = Math.min(1, 320 / bitmap.width, 200 / bitmap.height);
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		const context = canvas.getContext("2d");
		if (!context)
			throw new Error("Image previews are unavailable in this browser.");
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		const thumbnail = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(blob) =>
					blob
						? resolve(blob)
						: reject(new Error("Image preview could not be created.")),
				"image/webp",
				0.8,
			),
		);
		return {
			image: {
				id: crypto.randomUUID(),
				name: file.name,
				contentType,
				size: file.size,
				width: bitmap.width,
				height: bitmap.height,
				createdAt: new Date().toISOString(),
			},
			original,
			thumbnail,
		};
	} finally {
		bitmap.close();
	}
}
