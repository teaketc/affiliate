import { SHOP_TYPES, type ShopType } from '@affiliate/shared';
import type { DataSourceName, ProductCandidate, ProductFields } from './types';

const MAX_NAME_LENGTH = 500;
const MAX_SHOP_NAME_LENGTH = 255;
const MAX_IMAGES = 20;
const MAX_PRICE = 9_999_999_999.99;

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(input: string): string {
	return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
		if (entity[0] === '#') {
			const code = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
		}
		return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
	});
}

export function normalizeText(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const text = decodeEntities(value)
		.replace(/[\u0000-\u001f\u007f]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!text) return null;
	return text.length > maxLength ? text.slice(0, maxLength) : text;
}

/**
 * Parses a price from numbers or strings like "1,299.00", "฿1,299", "1299 - 1599".
 * For ranges the lowest value is used. Returns null for anything not unambiguously numeric.
 */
export function normalizePrice(value: unknown): number | null {
	let num: number;
	if (typeof value === 'number') {
		num = value;
	} else if (typeof value === 'string') {
		const first = value.split(/\s[-–~]\s|\s?[–~]\s?/)[0] ?? '';
		const cleaned = first.replace(/[^\d.,]/g, '');
		if (!cleaned || !/\d/.test(cleaned)) return null;
		// "1,299.50" → 1299.50 ; treat commas as thousand separators
		const normalized = cleaned.replace(/,/g, '');
		if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
		num = Number(normalized);
	} else {
		return null;
	}
	if (!Number.isFinite(num) || num < 0 || num > MAX_PRICE) return null;
	return Math.round(num * 100) / 100;
}

export function normalizeCurrency(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const code = value.trim().toUpperCase();
	return /^[A-Z]{3}$/.test(code) ? code : null;
}

export function normalizeImageUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	let raw = decodeEntities(value.trim());
	if (raw.startsWith('//')) raw = `https:${raw}`;
	try {
		const url = new URL(raw);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
		return url.toString();
	} catch {
		return null;
	}
}

export function normalizeImages(values: unknown[]): string[] {
	const out: string[] = [];
	for (const v of values) {
		const url = normalizeImageUrl(v);
		if (url && !out.includes(url)) out.push(url);
		if (out.length >= MAX_IMAGES) break;
	}
	return out;
}

function normalizeShopType(value: unknown): ShopType | null {
	return SHOP_TYPES.find((t) => t === value) ?? null;
}

function asArray(value: unknown): unknown[] {
	if (value === undefined || value === null) return [];
	return Array.isArray(value) ? value : [value];
}

export interface MergeResult {
	fields: ProductFields;
	fieldSources: Partial<Record<keyof ProductFields, DataSourceName>>;
}

/**
 * Merges candidates in priority order: the first source that yields a valid,
 * normalised value for a field wins. Missing values stay null — nothing is invented.
 */
export function mergeCandidates(candidates: ProductCandidate[]): MergeResult {
	const fields: ProductFields = {
		productName: null,
		productImage: null,
		productImages: [],
		shopName: null,
		shopType: null,
		price: null,
		originalPrice: null,
		currency: null,
		externalProductId: null
	};
	const fieldSources: MergeResult['fieldSources'] = {};

	const take = <K extends keyof ProductFields>(key: K, value: ProductFields[K] | null, source: DataSourceName) => {
		if (value === null || fields[key] !== null) return;
		fields[key] = value;
		fieldSources[key] = source;
	};

	for (const c of candidates) {
		take('productName', normalizeText(c.productName, MAX_NAME_LENGTH), c.source);
		take('shopName', normalizeText(c.shopName, MAX_SHOP_NAME_LENGTH), c.source);
		take('shopType', normalizeShopType(c.shopType), c.source);
		take('price', normalizePrice(c.price), c.source);
		take('originalPrice', normalizePrice(c.originalPrice), c.source);
		take('currency', normalizeCurrency(c.currency), c.source);
		take('externalProductId', normalizeText(c.externalProductId, 128), c.source);

		const images = normalizeImages([...asArray(c.productImage), ...asArray(c.productImages)]);
		for (const img of images) if (!fields.productImages.includes(img) && fields.productImages.length < MAX_IMAGES) fields.productImages.push(img);
		take('productImage', images[0] ?? null, c.source);
	}
	if (fields.productImages.length) fieldSources.productImages = fieldSources.productImage ?? candidates[0]?.source ?? 'html';

	// An "original price" lower than or equal to the selling price is not a discount; drop it.
	if (fields.originalPrice !== null && fields.price !== null && fields.originalPrice <= fields.price) {
		fields.originalPrice = null;
		delete fieldSources.originalPrice;
	}
	return { fields, fieldSources };
}
