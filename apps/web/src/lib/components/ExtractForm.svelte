<script lang="ts">
	import type { ExtractResultDTO } from '@affiliate/shared';
	import { api, ApiError, errorMessage } from '$lib/api';
	import { formatPrice } from '$lib/format';
	import { bumpDataVersion, notify } from '$lib/toast.svelte';
	import MarketplaceBadge from './MarketplaceBadge.svelte';
	import ProductThumb from './ProductThumb.svelte';
	import Spinner from './Spinner.svelte';

	let url = $state('');
	let loading = $state(false);
	let step = $state(0);
	let result = $state<{ status: 'success' | 'partial'; message: string; data: ExtractResultDTO } | null>(null);
	let error = $state<{ code: string; message: string } | null>(null);

	const steps = ['ตรวจสอบ URL', 'Resolve ลิงก์อย่างปลอดภัย', 'ดึงข้อมูลสินค้า', 'บันทึกลงฐานข้อมูล'];
	const looksValid = $derived(/^https?:\/\/\S+$/i.test(url.trim()));

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!looksValid || loading) return;
		loading = true;
		result = null;
		error = null;
		step = 0;
		// The API does all steps in one request; advance the indicator while we wait.
		const timer = setInterval(() => (step = Math.min(step + 1, steps.length - 1)), 700);
		try {
			const res = await api.extract(url.trim());
			result = res;
			url = '';
			bumpDataVersion();
			if (res.status === 'partial') {
				notify('warning', 'บันทึกข้อมูลบางส่วนแล้ว', `ขาด: ${res.data.missingFields.join(', ')}`);
			} else {
				notify('success', res.data.duplicate ? 'อัปเดตสินค้าที่มีอยู่แล้ว' : 'ดึงและบันทึกสินค้าแล้ว', res.data.productName);
			}
		} catch (err) {
			error = err instanceof ApiError ? { code: err.code, message: err.message } : { code: 'ERROR', message: errorMessage(err) };
			notify('error', 'ดึงข้อมูลไม่สำเร็จ', errorMessage(err));
			if (err instanceof ApiError && err.code !== 'RATE_LIMITED' && err.code !== 'NETWORK_ERROR') bumpDataVersion();
		} finally {
			clearInterval(timer);
			loading = false;
		}
	}
</script>

<section class="card p-5 sm:p-6">
	<form onsubmit={submit} class="space-y-3">
		<label for="affiliate-url" class="label">Affiliate URL (Shopee / Lazada)</label>
		<div class="flex flex-col gap-2 sm:flex-row">
			<input
				id="affiliate-url"
				class="input flex-1"
				type="url"
				inputmode="url"
				autocomplete="off"
				placeholder="https://s.shopee.co.th/xxxx หรือ https://c.lazada.co.th/t/c.xxxx"
				bind:value={url}
				disabled={loading}
				maxlength={2048}
				required
			/>
			<button class="btn-primary sm:w-36" type="submit" disabled={!looksValid || loading}>
				{#if loading}<Spinner /> กำลังดึง…{:else}Extract{/if}
			</button>
		</div>
		<p class="text-xs text-slate-500">ระบบจะดึงข้อมูลและบันทึกอัตโนมัติทันที ไม่ต้องกดยืนยัน</p>
	</form>

	{#if loading}
		<ol class="mt-5 grid gap-2 sm:grid-cols-4" aria-label="Processing status">
			{#each steps as label, i}
				<li class="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs {i < step ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : i === step ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-400'}">
					{#if i < step}✓{:else if i === step}<Spinner size="h-3 w-3" />{:else}•{/if}
					{label}
				</li>
			{/each}
		</ol>
	{/if}

	{#if error}
		<div class="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
			<p class="font-semibold">ไม่สามารถดึงข้อมูลสินค้าได้ · <code class="text-xs">{error.code}</code></p>
			<p class="mt-1">{error.message}</p>
		</div>
	{/if}

	{#if result}
		{@const p = result.data}
		<div class="mt-5 rounded-lg border p-4 {result.status === 'partial' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}" role="status">
			<p class="mb-3 text-sm font-semibold {result.status === 'partial' ? 'text-amber-800' : 'text-emerald-800'}">
				{result.status === 'partial' ? '⚠ ' : '✓ '}{result.message}{p.duplicate ? ' · สินค้าซ้ำ (อัปเดตข้อมูลล่าสุด)' : ''}
			</p>
			<div class="flex gap-4">
				<ProductThumb src={p.productImage} alt={p.productName} size="h-20 w-20" />
				<div class="min-w-0 flex-1 space-y-1 text-sm">
					<p class="font-medium break-words text-slate-900">{p.productName}</p>
					<div class="flex flex-wrap items-center gap-2 text-slate-600">
						<MarketplaceBadge marketplace={p.marketplace} />
						<span>{p.shopName ?? 'ไม่ทราบชื่อร้าน'}</span>
						<span class="font-semibold text-slate-900">{formatPrice(p.price, p.currency)}</span>
					</div>
					{#if p.missingFields.length}
						<p class="text-xs text-amber-700">ข้อมูลที่ขาด: {p.missingFields.join(', ')}</p>
					{/if}
					<a class="text-xs break-all text-indigo-600 hover:underline" href={p.productUrl} target="_blank" rel="noopener noreferrer">{p.productUrl}</a>
				</div>
			</div>
		</div>
	{/if}
</section>
