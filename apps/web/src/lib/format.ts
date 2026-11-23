import type { ShopType } from '@affiliate/shared';

export function formatPrice(price: number | null, currency: string | null): string {
	if (price === null) return '—';
	if (currency) {
		try {
			return new Intl.NumberFormat('th-TH', { style: 'currency', currency, maximumFractionDigits: 2 }).format(price);
		} catch {
			// unknown currency code
		}
	}
	return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(price);
}

export function formatDate(iso: string | null): string {
	if (!iso) return '—';
	return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export const SHOP_TYPE_LABEL: Record<ShopType, string> = {
	MALL: 'Mall / LazMall',
	PREFERRED: 'Preferred Seller',
	NORMAL: 'Normal Shop'
};

export function truncateMiddle(s: string, max = 60): string {
	if (s.length <= max) return s;
	const half = Math.floor((max - 1) / 2);
	return `${s.slice(0, half)}…${s.slice(-half)}`;
}
