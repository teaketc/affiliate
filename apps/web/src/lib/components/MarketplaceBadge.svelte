<script lang="ts">
	import type { Marketplace } from '@affiliate/shared';
	let { marketplace }: { marketplace: Marketplace | null } = $props();
</script>

{#if marketplace === 'SHOPEE'}
	<span class="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-shopee ring-1 ring-orange-200">Shopee</span>
{:else if marketplace === 'LAZADA'}
	<span class="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-lazada ring-1 ring-indigo-200">Lazada</span>
{:else}
	<span class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Unknown</span>
{/if}
