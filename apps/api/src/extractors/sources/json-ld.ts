export interface JsonLdProductFields {
	name: unknown;
	images: unknown[];
	price: unknown;
	lowPrice: unknown;
	highPrice: unknown;
	currency: unknown;
	sellerName: unknown;
	sku: unknown;
	url: unknown;
	raw: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasType(node: Record<string, unknown>, type: string): boolean {
	const t = node['@type'];
	if (typeof t === 'string') return t.toLowerCase() === type.toLowerCase();
	if (Array.isArray(t)) return t.some((v) => typeof v === 'string' && v.toLowerCase() === type.toLowerCase());
	return false;
}

/** Depth-limited search for the first schema.org Product node (handles arrays and @graph). */
export function findJsonLdProduct(blocks: unknown[]): Record<string, unknown> | null {
	const stack: Array<{ value: unknown; depth: number }> = blocks.map((value) => ({ value, depth: 0 }));
	while (stack.length) {
		const { value, depth } = stack.shift() as { value: unknown; depth: number };
		if (depth > 6) continue;
		if (Array.isArray(value)) {
			for (const v of value) stack.push({ value: v, depth: depth + 1 });
			continue;
		}
		if (!isRecord(value)) continue;
		if (hasType(value, 'Product') || hasType(value, 'ProductGroup')) return value;
		if (Array.isArray(value['@graph'])) stack.push({ value: value['@graph'], depth: depth + 1 });
	}
	return null;
}

function imageUrls(value: unknown): unknown[] {
	if (typeof value === 'string') return [value];
	if (Array.isArray(value)) return value.flatMap(imageUrls);
	if (isRecord(value)) return [value.url ?? value.contentUrl].filter((v) => v !== undefined);
	return [];
}

function firstOffer(value: unknown): Record<string, unknown> | null {
	if (Array.isArray(value)) {
		for (const v of value) if (isRecord(v)) return v;
		return null;
	}
	return isRecord(value) ? value : null;
}

export function readJsonLdProduct(node: Record<string, unknown>): JsonLdProductFields {
	const offer = firstOffer(node.offers);
	const seller = offer && isRecord(offer.seller) ? offer.seller : null;
	return {
		name: node.name,
		images: imageUrls(node.image),
		price: offer?.price,
		lowPrice: offer?.lowPrice,
		highPrice: offer?.highPrice,
		currency: offer?.priceCurrency,
		sellerName: seller?.name,
		sku: node.sku ?? node.productID,
		url: node.url ?? offer?.url,
		raw: node
	};
}
