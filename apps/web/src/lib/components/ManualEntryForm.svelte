<script lang="ts">
	import { SHOP_TYPES, type ExtractResultDTO, type ManualEntryContext, type ShopType } from '@affiliate/shared';
	import { api, errorMessage } from '$lib/api';
	import { SHOP_TYPE_LABEL } from '$lib/format';
	import MarketplaceBadge from './MarketplaceBadge.svelte';
	import Spinner from './Spinner.svelte';

	let {
		context,
		onsaved,
		oncancel
	}: {
		context: ManualEntryContext;
		onsaved: (res: { status: 'success' | 'partial'; message: string; data: ExtractResultDTO }) => void;
		oncancel: () => void;
	} = $props();

	let form = $state({ productName: '', price: '', originalPrice: '', currency: 'THB', productImage: '', shopName: '', shopType: '' as ShopType | '' });
	let saving = $state(false);
	let error = $state('');

	function parsePrice(v: string): number | null | 'invalid' {
		const t = v.replace(/,/g, '').trim();
		if (!t) return null;
		const n = Number(t);
		return Number.isFinite(n) && n >= 0 ? n : 'invalid';
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		const price = parsePrice(form.price);
		const originalPrice = parsePrice(form.originalPrice);
		if (!form.productName.trim()) return (error = 'กรุณากรอกชื่อสินค้า');
		if (price === 'invalid' || originalPrice === 'invalid') return (error = 'ราคาต้องเป็นตัวเลขไม่ติดลบ');
		if (form.currency && !/^[A-Za-z]{3}$/.test(form.currency)) return (error = 'สกุลเงินต้องเป็นรหัส 3 ตัวอักษร เช่น THB');
		saving = true;
		try {
			const res = await api.saveManual({
				affiliateUrl: context.affiliateUrl,
				productName: form.productName.trim(),
				price,
				originalPrice,
				currency: form.currency.trim() || null,
				productImage: form.productImage.trim() || null,
				shopName: form.shopName.trim() || null,
				shopType: form.shopType || null
			});
			onsaved(res);
		} catch (err) {
			error = errorMessage(err);
		} finally {
			saving = false;
		}
	}
</script>

<div class="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
	<div class="flex flex-wrap items-center gap-2 text-sm">
		<MarketplaceBadge marketplace={context.marketplace} />
		<span class="font-semibold text-amber-900">พบสินค้าแล้ว แต่ {context.marketplace === 'SHOPEE' ? 'Shopee' : 'Lazada'} ไม่เปิดเผยรายละเอียดให้ผู้ที่ไม่ได้ล็อกอิน</span>
	</div>
	<p class="mt-1 text-sm text-amber-800">
		ระบบยืนยันลิงก์และรหัสสินค้าแล้ว กรอกรายละเอียดที่เหลือเองได้ (ดูได้จากหน้าสร้างลิงก์ใน Affiliate dashboard หรือ
		<a class="underline" href={context.productUrl} target="_blank" rel="noopener noreferrer">เปิดหน้าสินค้า</a> ขณะล็อกอิน)
	</p>
	<dl class="mt-3 grid gap-x-3 gap-y-1 text-xs text-amber-900 sm:grid-cols-[auto_1fr]">
		<dt class="font-medium">Product ID</dt><dd class="font-mono">{context.externalProductId}</dd>
		<dt class="font-medium">Product URL</dt><dd class="font-mono break-all">{context.productUrl}</dd>
	</dl>

	<form class="mt-4 grid gap-3 sm:grid-cols-2" onsubmit={submit}>
		<div class="sm:col-span-2">
			<label class="label" for="m-name">ชื่อสินค้า *</label>
			<input id="m-name" class="input" bind:value={form.productName} maxlength={500} required />
		</div>
		<div>
			<label class="label" for="m-price">ราคา</label>
			<input id="m-price" class="input" inputmode="decimal" placeholder="เช่น 299" bind:value={form.price} />
		</div>
		<div>
			<label class="label" for="m-oprice">ราคาเดิม (ถ้ามีส่วนลด)</label>
			<input id="m-oprice" class="input" inputmode="decimal" bind:value={form.originalPrice} />
		</div>
		<div>
			<label class="label" for="m-cur">สกุลเงิน</label>
			<input id="m-cur" class="input uppercase" maxlength={3} bind:value={form.currency} />
		</div>
		<div>
			<label class="label" for="m-type">ประเภทร้าน</label>
			<select id="m-type" class="input" bind:value={form.shopType}>
				<option value="">ไม่ระบุ</option>
				{#each SHOP_TYPES as t}<option value={t}>{SHOP_TYPE_LABEL[t]}</option>{/each}
			</select>
		</div>
		<div>
			<label class="label" for="m-shop">ชื่อร้าน</label>
			<input id="m-shop" class="input" bind:value={form.shopName} maxlength={255} />
		</div>
		<div>
			<label class="label" for="m-img">ลิงก์รูปสินค้า</label>
			<input id="m-img" class="input" type="url" placeholder="https://…" bind:value={form.productImage} />
		</div>
		{#if error}<p class="text-sm text-rose-600 sm:col-span-2" role="alert">{error}</p>{/if}
		<div class="flex justify-end gap-2 sm:col-span-2">
			<button type="button" class="btn-secondary" onclick={oncancel} disabled={saving}>ยกเลิก</button>
			<button type="submit" class="btn-primary" disabled={saving}>{#if saving}<Spinner />{/if} บันทึกสินค้า</button>
		</div>
	</form>
</div>
