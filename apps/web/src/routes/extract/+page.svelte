<script lang="ts">
	import { untrack } from 'svelte';
	import type { ProductDTO } from '@affiliate/shared';
	import { api, errorMessage } from '$lib/api';
	import ExtractForm from '$lib/components/ExtractForm.svelte';
	import ProductTable from '$lib/components/ProductTable.svelte';
	import StateBlock from '$lib/components/StateBlock.svelte';
	import { dataVersion } from '$lib/toast.svelte';

	let products = $state<ProductDTO[]>([]);
	let loading = $state(true);
	let error = $state('');

	async function load() {
		error = '';
		try {
			products = (await api.products({ pageSize: 10 })).items;
		} catch (e) {
			error = errorMessage(e);
		} finally {
			loading = false;
		}
	}

	// Refreshes automatically after every successful extraction
	$effect(() => {
		void dataVersion.value;
		// Only the dependencies above may trigger a refetch; load() reads/writes state itself.
		untrack(load);
	});
</script>

<div class="space-y-6">
	<ExtractForm />
	<section class="card overflow-hidden">
		<header class="border-b border-slate-200 px-4 py-3"><h2 class="font-semibold">สินค้าที่บันทึกล่าสุด</h2></header>
		{#if loading}
			<StateBlock kind="loading" title="กำลังโหลด…" />
		{:else if error}
			<StateBlock kind="error" title="โหลดรายการไม่สำเร็จ" message={error} onretry={load} />
		{:else if products.length === 0}
			<StateBlock kind="empty" title="ยังไม่มีสินค้า" message="สินค้าที่ดึงสำเร็จจะแสดงที่นี่ทันที" />
		{:else}
			<ProductTable {products} />
		{/if}
	</section>
</div>
