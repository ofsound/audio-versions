// jsdom has no layout engine. Real selection geometry is checked in the browser.
if (typeof Range !== "undefined") {
	Range.prototype.getClientRects ??= () =>
		Object.assign([], { item: () => null });
	Range.prototype.getBoundingClientRect ??= () => new DOMRect();
}
