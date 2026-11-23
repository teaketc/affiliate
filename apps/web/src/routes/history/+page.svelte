<script lang="ts">
	import { untrack } from 'svelte';
	import { EXTRACTION_STATUSES, type ExtractionLogDetailDTO, type ExtractionLogDTO, type Paginated } from '@affiliate/shared';
	import { api, errorMessage, type LogQuery } from '$lib/api';
	import { formatDate, truncateMiddle } from '$lib/format';
	import MarketplaceBadge from '$lib/components/MarketplaceBadge.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import StateBlock from '$lib/components/StateBlock.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { dataVersion } from '$lib/toast.svelte';

	let query = $state<Required<LogQuery>>({ page: 1, pageSize: 20, search: '', marketplace: '', status: '' });
	let searchInput = $state('');
	let result = $state<Paginated<ExtractionLogDTO> | null>(null);
	let loading = $state(true);
	let error = $state('');
	let detail = $state<ExtractionLogDetailDTO | null>(null);
	let detailLoading = $state<string | null>(null);
	let requestSeq = 0;

	async function load() {
		const seq = ++requestSeq;
		loading = true;
		error = '';
		try {
			const r = await api.logs({ ...query });
			if (seq === requestSeq) result = r;
		} catch (e) {
			if (seq === requestSeq) error = errorMessage(e);
		} finally {
			if (seq === requestSeq) loading = false;
		}
	}

	$effect(() => {
		void dataVersion.value;
		void [query.page, query.pageSize, query.search, query.marketplace, query.status];
		// Only the dependencies above may trigger a refetch; load() reads/writes state itself.
		untrack(load);
	});

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

	async function openDetail(id: string) {
		detailLoading = id;
		try {
			detail = await api.log(id);
		} catch (e) {
			error = errorMessage(e);
		} finally {
			detailLoading = null;
		}
	}
</script>

<section class="card overflow-hidden">
	<div class="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="lg:col-span-2">
			<label for="q" class="label">ค้นหา Affiliate URL</label>
			<input id="q" class="input" type="search" placeholder="https://s.shopee.co.th/…" bind:value={searchInput} />
		</div>
		<div>
			<label for="mp" class="label">Marketplace</label>
			<select id="mp" class="input" bind:value={query.marketplace} onchange={() => (query.page = 1)}>
				<option value="">ทั้งหมด</option>
				<option value="SHOPEE">Shopee</option>
				<option value="LAZADA">Lazada</option>
			</select>
		</div>
		<div>
			<label for="status" class="label">สถานะ</label>
			<select id="status" class="input" bind:value={query.status} onchange={() => (query.page = 1)}>
				<option value="">ทั้งหมด</option>
				{#each EXTRACTION_STATUSES as s}<option value={s}>{s}</option>{/each}
			</select>
		</div>
	</div>

	{#if loading && !result}
		<StateBlock kind="loading" title="กำลังโหลดประวัติ…" />
	{:else if error && !result}
		<StateBlock kind="error" title="โหลดประวัติไม่สำเร็จ" message={error} onretry={load} />
	{:else if result && result.items.length === 0}
		<StateBlock kind="empty" title="ไม่พบประวัติการดึงข้อมูล" />
	{:else if result}
		<div class="hidden overflow-x-auto md:block">
			<table class="min-w-full divide-y divide-slate-200 text-sm">
				<thead class="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
					<tr>
						<th class="px-4 py-3">Affiliate URL</th>
						<th class="px-4 py-3">Marketplace</th>
						<th class="px-4 py-3">สถานะ</th>
						<th class="px-4 py-3">ข้อผิดพลาด</th>
						<th class="px-4 py-3">วันที่ดึงข้อมูล</th>
						<th class="px-4 py-3"></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#each result.items as log (log.id)}
						<tr class="hover:bg-slate-50">
							<td class="px-4 py-3 font-mono text-xs" title={log.affiliateUrl}>{truncateMiddle(log.affiliateUrl, 50)}</td>
							<td class="px-4 py-3"><MarketplaceBadge marketplace={log.marketplace} /></td>
							<td class="px-4 py-3"><StatusBadge status={log.status} /></td>
							<td class="max-w-xs px-4 py-3 text-xs text-slate-600">
								{#if log.errorCode}<code class="font-semibold">{log.errorCode}</code><br />{/if}{log.errorMessage ?? '—'}
							</td>
							<td class="px-4 py-3 text-xs whitespace-nowrap text-slate-500">{formatDate(log.createdAt)}</td>
							<td class="px-4 py-3 text-right">
								<button class="btn-secondary px-3 py-1.5" onclick={() => openDetail(log.id)} disabled={detailLoading === log.id}>
									{#if detailLoading === log.id}<Spinner />{/if} รายละเอียด
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<ul class="divide-y divide-slate-100 md:hidden">
			{#each result.items as log (log.id)}
				<li>
					<button class="w-full space-y-1 p-4 text-left" onclick={() => openDetail(log.id)}>
						<div class="flex items-center gap-2"><StatusBadge status={log.status} /><MarketplaceBadge marketplace={log.marketplace} /></div>
						<p class="font-mono text-xs break-all text-slate-700">{log.affiliateUrl}</p>
						{#if log.errorMessage}<p class="text-xs text-slate-500">{log.errorCode}: {log.errorMessage}</p>{/if}
						<p class="text-xs text-slate-400">{formatDate(log.createdAt)}</p>
					</button>
				</li>
			{/each}
		</ul>
		<Pagination meta={result.pagination} onchange={(p) => (query.page = p)} />
	{/if}
</section>

{#if detail}
	<Modal title="รายละเอียดการดึงข้อมูล" onclose={() => (detail = null)}>
		<dl class="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
			<dt class="text-slate-500">สถานะ</dt><dd class="col-span-2"><StatusBadge status={detail.status} /></dd>
			<dt class="text-slate-500">Marketplace</dt><dd class="col-span-2"><MarketplaceBadge marketplace={detail.marketplace} /></dd>
			<dt class="text-slate-500">Affiliate URL</dt><dd class="col-span-2 font-mono text-xs break-all">{detail.affiliateUrl}</dd>
			<dt class="text-slate-500">ข้อผิดพลาด</dt><dd class="col-span-2">{detail.errorCode ?? '—'} {detail.errorMessage ?? ''}</dd>
			<dt class="text-slate-500">สินค้า</dt>
			<dd class="col-span-2">
				{#if detail.product}<a class="text-indigo-600 hover:underline" href={detail.product.productUrl} target="_blank" rel="noopener noreferrer">{detail.product.productName}</a>{:else}—{/if}
			</dd>
			<dt class="text-slate-500">วันที่</dt><dd class="col-span-2">{formatDate(detail.createdAt)}</dd>
		</dl>
		<details class="mt-4">
			<summary class="cursor-pointer text-sm font-medium text-slate-700">Extracted data (JSON)</summary>
			<pre class="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(detail.extractedData, null, 2)}</pre>
		</details>
	</Modal>
{/if}
