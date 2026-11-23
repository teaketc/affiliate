<script lang="ts">
	import { SHOP_TYPES, type Paginated, type ProductDTO } from '@affiliate/shared';
	import { api, errorMessage, type ProductQuery } from '$lib/api';
	import { SHOP_TYPE_LABEL } from '$lib/format';
	import Modal from '$lib/components/Modal.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import ProductEditModal from '$lib/components/ProductEditModal.svelte';
	import ProductTable from '$lib/components/ProductTable.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import StateBlock from '$lib/components/StateBlock.svelte';
	import { bumpDataVersion, dataVersion, notify } from '$lib/toast.svelte';

	let query = $state<Required<Pick<ProductQuery, 'page' | 'pageSize' | 'search' | 'marketplace' | 'shopType' | 'order'>>>({
		page: 1,
		pageSize: 20,
		search: '',
		marketplace: '',
		shopType: '',
		order: 'desc'
	});
	let searchInput = $state('');
	let result = $state<Paginated<ProductDTO> | null>(null);
	let loading = $state(true);
	let error = $state('');
	let editing = $state<ProductDTO | null>(null);
	let deleting = $state<ProductDTO | null>(null);
	let deleteBusy = $state(false);
	let requestSeq = 0;

	async function load() {
		const seq = ++requestSeq;
		loading = true;
		error = '';
		try {
			const r = await api.products({ ...query });
			if (seq === requestSeq) result = r;
		} catch (e) {
			if (seq === requestSeq) error = errorMessage(e);
		} finally {
			if (seq === requestSeq) loading = false;
		}
	}

	$effect(() => {
		void dataVersion.value;
		void [query.page, query.pageSize, query.search, query.marketplace, query.shopType, query.order];
		load();
	});

	// Debounced search
	$effect(() => {
		const value = searchInput;
		const t = setTimeout(() => {
			if (value.trim() !== query.search) {
				query.search = value.trim();
				query.page = 1;
			}
		}, 350);
		return () => clearTimeout(t);
	});

	function resetPage() {
		query.page = 1;
	}

	async function confirmDelete() {
		if (!deleting) return;
		deleteBusy = true;
		try {
			await api.deleteProduct(deleting.id);
			notify('success', 'ลบสินค้าแล้ว', deleting.productName);
			deleting = null;
			if (result && result.items.length === 1 && query.page > 1) query.page -= 1;
			bumpDataVersion();
		} catch (e) {
			notify('error', 'ลบไม่สำเร็จ', errorMessage(e));
		} finally {
			deleteBusy = false;
		}
	}
</script>

<section class="card overflow-hidden">
	<div class="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-5">
		<div class="lg:col-span-2">
			<label for="search" class="label">ค้นหา</label>
			<input id="search" class="input" type="search" placeholder="ชื่อสินค้า / ร้าน / Product ID" bind:value={searchInput} />
		</div>
		<div>
			<label for="mp" class="label">Marketplace</label>
			<select id="mp" class="input" bind:value={query.marketplace} onchange={resetPage}>
				<option value="">ทั้งหมด</option>
				<option value="SHOPEE">Shopee</option>
				<option value="LAZADA">Lazada</option>
			</select>
		</div>
		<div>
			<label for="st" class="label">ประเภทร้าน</label>
			<select id="st" class="input" bind:value={query.shopType} onchange={resetPage}>
				<option value="">ทั้งหมด</option>
				{#each SHOP_TYPES as t}<option value={t}>{SHOP_TYPE_LABEL[t]}</option>{/each}
			</select>
		</div>
		<div>
			<label for="ord" class="label">เรียงตามวันที่สร้าง</label>
			<select id="ord" class="input" bind:value={query.order} onchange={resetPage}>
				<option value="desc">ใหม่ → เก่า</option>
				<option value="asc">เก่า → ใหม่</option>
			</select>
		</div>
	</div>

	{#if loading && !result}
		<StateBlock kind="loading" title="กำลังโหลดสินค้า…" />
	{:else if error}
		<StateBlock kind="error" title="โหลดสินค้าไม่สำเร็จ" message={error} onretry={load} />
	{:else if result && result.items.length === 0}
		<StateBlock
			kind="empty"
			title={query.search || query.marketplace || query.shopType ? 'ไม่พบสินค้าที่ตรงกับเงื่อนไข' : 'ยังไม่มีสินค้า'}
			message={query.search || query.marketplace || query.shopType ? 'ลองปรับคำค้นหาหรือตัวกรอง' : 'ไปที่หน้า Extract Product เพื่อเพิ่มสินค้า'}
		/>
	{:else if result}
		<div class="relative">
			{#if loading}<div class="absolute top-2 right-4 text-indigo-600"><Spinner /></div>{/if}
			<ProductTable products={result.items} onedit={(p) => (editing = p)} ondelete={(p) => (deleting = p)} />
		</div>
		<Pagination meta={result.pagination} onchange={(p) => (query.page = p)} />
	{/if}
</section>

{#if editing}
	<ProductEditModal
		product={editing}
		onclose={() => (editing = null)}
		onsaved={() => {
			editing = null;
			bumpDataVersion();
		}}
	/>
{/if}

{#if deleting}
	<Modal title="ยืนยันการลบสินค้า" onclose={() => (deleting = null)}>
		<p class="text-sm text-slate-700">ต้องการลบ <span class="font-semibold">{deleting.productName}</span> ใช่หรือไม่?</p>
		<p class="mt-2 text-xs text-slate-500">ประวัติการดึงข้อมูล (Extraction Logs) จะยังถูกเก็บไว้</p>
		{#snippet footer()}
			<button class="btn-secondary" onclick={() => (deleting = null)} disabled={deleteBusy}>ยกเลิก</button>
			<button class="btn-danger" onclick={confirmDelete} disabled={deleteBusy}>{#if deleteBusy}<Spinner />{/if} ลบสินค้า</button>
		{/snippet}
	</Modal>
{/if}
