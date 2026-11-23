<script lang="ts">
	import type { ProductDTO } from '@affiliate/shared';
	import { formatDate, formatPrice, SHOP_TYPE_LABEL, truncateMiddle } from '$lib/format';
	import MarketplaceBadge from './MarketplaceBadge.svelte';
	import ProductThumb from './ProductThumb.svelte';

	let {
		products,
		onedit,
		ondelete
	}: { products: ProductDTO[]; onedit?: (p: ProductDTO) => void; ondelete?: (p: ProductDTO) => void } = $props();
	const actions = $derived(Boolean(onedit || ondelete));
</script>

<!-- Desktop table -->
<div class="hidden overflow-x-auto md:block">
	<table class="min-w-full divide-y divide-slate-200 text-sm">
		<thead class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
			<tr>
				<th class="px-4 py-3">สินค้า</th>
				<th class="px-4 py-3">Marketplace</th>
				<th class="px-4 py-3">ร้าน</th>
				<th class="px-4 py-3 text-right">ราคา</th>
				<th class="px-4 py-3">Affiliate URL</th>
				<th class="px-4 py-3">วันที่สร้าง</th>
				{#if actions}<th class="px-4 py-3 text-right">จัดการ</th>{/if}
			</tr>
		</thead>
		<tbody class="divide-y divide-slate-100">
			{#each products as p (p.id)}
				<tr class="hover:bg-slate-50">
					<td class="max-w-xs px-4 py-3">
						<div class="flex items-center gap-3">
							<ProductThumb src={p.productImage} alt={p.productName} />
							<a href={p.productUrl} target="_blank" rel="noopener noreferrer" class="line-clamp-2 font-medium text-slate-900 hover:text-indigo-600">{p.productName}</a>
						</div>
					</td>
					<td class="px-4 py-3"><MarketplaceBadge marketplace={p.marketplace} /></td>
					<td class="px-4 py-3">
						<p class="text-slate-800">{p.shopName ?? '—'}</p>
						<p class="text-xs text-slate-500">{p.shopType ? SHOP_TYPE_LABEL[p.shopType] : 'ไม่ทราบประเภท'}</p>
					</td>
					<td class="px-4 py-3 text-right whitespace-nowrap">
						<p class="font-semibold">{formatPrice(p.price, p.currency)}</p>
						{#if p.originalPrice !== null}<p class="text-xs text-slate-400 line-through">{formatPrice(p.originalPrice, p.currency)}</p>{/if}
					</td>
					<td class="px-4 py-3"><a class="text-xs text-indigo-600 hover:underline" href={p.affiliateUrl} target="_blank" rel="noopener noreferrer" title={p.affiliateUrl}>{truncateMiddle(p.affiliateUrl, 36)}</a></td>
					<td class="px-4 py-3 text-xs whitespace-nowrap text-slate-500">{formatDate(p.createdAt)}</td>
					{#if actions}
						<td class="px-4 py-3 text-right whitespace-nowrap">
							{#if onedit}<button class="btn-secondary px-3 py-1.5" onclick={() => onedit(p)}>แก้ไข</button>{/if}
							{#if ondelete}<button class="btn px-3 py-1.5 text-rose-600 hover:bg-rose-50" onclick={() => ondelete(p)}>ลบ</button>{/if}
						</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<!-- Mobile cards -->
<ul class="divide-y divide-slate-100 md:hidden">
	{#each products as p (p.id)}
		<li class="flex gap-3 p-4">
			<ProductThumb src={p.productImage} alt={p.productName} size="h-16 w-16" />
			<div class="min-w-0 flex-1 space-y-1">
				<a href={p.productUrl} target="_blank" rel="noopener noreferrer" class="line-clamp-2 text-sm font-medium">{p.productName}</a>
				<div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
					<MarketplaceBadge marketplace={p.marketplace} />
					<span>{p.shopName ?? '—'}</span>
					{#if p.shopType}<span>· {SHOP_TYPE_LABEL[p.shopType]}</span>{/if}
				</div>
				<p class="text-sm font-semibold">{formatPrice(p.price, p.currency)}</p>
				<p class="text-xs text-slate-400">{formatDate(p.createdAt)}</p>
				{#if actions}
					<div class="flex gap-2 pt-1">
						{#if onedit}<button class="btn-secondary px-3 py-1 text-xs" onclick={() => onedit(p)}>แก้ไข</button>{/if}
						{#if ondelete}<button class="btn px-3 py-1 text-xs text-rose-600 hover:bg-rose-50" onclick={() => ondelete(p)}>ลบ</button>{/if}
					</div>
				{/if}
			</div>
		</li>
	{/each}
</ul>
