<script lang="ts">
	import { untrack } from 'svelte';
	import type { ProductDTO, StatisticsDTO } from '@affiliate/shared';
	import { api, errorMessage } from '$lib/api';
	import ExtractForm from '$lib/components/ExtractForm.svelte';
	import ProductTable from '$lib/components/ProductTable.svelte';
	import StateBlock from '$lib/components/StateBlock.svelte';
	import { dataVersion } from '$lib/toast.svelte';

	let stats = $state<StatisticsDTO | null>(null);
	let recent = $state<ProductDTO[]>([]);
	let loading = $state(true);
	let error = $state('');

	async function load() {
		loading = stats === null;
		error = '';
		try {
			const [s, r] = await Promise.all([api.statistics(), api.products({ pageSize: 5 })]);
			stats = s;
			recent = r.items;
		} catch (e) {
			error = errorMessage(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void dataVersion.value;
		// Only the dependencies above may trigger a refetch; load() reads/writes state itself.
		untrack(load);
	});

	const cards = $derived(
		stats
			? [
					{ label: 'Total Products', value: stats.totalProducts, tone: 'text-slate-900' },
					{ label: 'Shopee Products', value: stats.shopeeProducts, tone: 'text-shopee' },
					{ label: 'Lazada Products', value: stats.lazadaProducts, tone: 'text-lazada' },
					{ label: 'Successful Extractions', value: stats.successfulExtractions, tone: 'text-emerald-600' },
					{ label: 'Partial Extractions', value: stats.partialExtractions, tone: 'text-amber-600' },
					{ label: 'Failed Extractions', value: stats.failedExtractions, tone: 'text-rose-600' }
				]
			: []
	);
</script>

<div class="space-y-6">
	{#if loading}
		<div class="card"><StateBlock kind="loading" title="กำลังโหลดสถิติ…" /></div>
	{:else if error}
		<div class="card"><StateBlock kind="error" title="โหลดข้อมูลไม่สำเร็จ" message={error} onretry={load} /></div>
	{:else}
		<div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
			{#each cards as c}
				<div class="card p-4">
					<p class="text-xs font-medium text-slate-500">{c.label}</p>
					<p class="mt-1 text-2xl font-semibold tabular-nums {c.tone}">{c.value.toLocaleString('th-TH')}</p>
				</div>
			{/each}
		</div>
	{/if}

	<ExtractForm />

	<section class="card overflow-hidden">
		<header class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
			<h2 class="font-semibold">สินค้าล่าสุด</h2>
			<a href="/products" class="text-sm text-indigo-600 hover:underline">ดูทั้งหมด →</a>
		</header>
		{#if !loading && !error && recent.length === 0}
			<StateBlock kind="empty" title="ยังไม่มีสินค้า" message="วาง Affiliate URL ด้านบนเพื่อเริ่มต้น" />
		{:else if recent.length}
			<ProductTable products={recent} />
		{/if}
	</section>
</div>
