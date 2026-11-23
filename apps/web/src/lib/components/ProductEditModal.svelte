<script lang="ts">
	import { SHOP_TYPES, type ProductDTO, type ShopType, type UpdateProductInput } from '@affiliate/shared';
	import { api, errorMessage } from '$lib/api';
	import { SHOP_TYPE_LABEL } from '$lib/format';
	import { notify } from '$lib/toast.svelte';
	import Modal from './Modal.svelte';
	import Spinner from './Spinner.svelte';

	let { product, onclose, onsaved }: { product: ProductDTO; onclose: () => void; onsaved: (p: ProductDTO) => void } = $props();

	// svelte-ignore state_referenced_locally
	const initial = product;
	let form = $state({
		productName: initial.productName,
		productImage: initial.productImage ?? '',
		shopName: initial.shopName ?? '',
		shopType: (initial.shopType ?? '') as ShopType | '',
		price: initial.price === null ? '' : String(initial.price),
		originalPrice: initial.originalPrice === null ? '' : String(initial.originalPrice),
		currency: initial.currency ?? '',
		affiliateUrl: initial.affiliateUrl
	});
	let saving = $state(false);
	let error = $state('');

	function parsePrice(v: string): number | null | 'invalid' {
		if (v.trim() === '') return null;
		const n = Number(v);
		return Number.isFinite(n) && n >= 0 ? n : 'invalid';
	}

	async function save(e?: SubmitEvent) {
		e?.preventDefault();
		error = '';
		const price = parsePrice(form.price);
		const originalPrice = parsePrice(form.originalPrice);
		if (!form.productName.trim()) return (error = 'กรุณากรอกชื่อสินค้า');
		if (price === 'invalid' || originalPrice === 'invalid') return (error = 'ราคาต้องเป็นตัวเลขไม่ติดลบ');
		if (form.currency && !/^[A-Za-z]{3}$/.test(form.currency)) return (error = 'สกุลเงินต้องเป็นรหัส 3 ตัวอักษร เช่น THB');

		const input: UpdateProductInput = {
			productName: form.productName.trim(),
			productImage: form.productImage.trim() || null,
			shopName: form.shopName.trim() || null,
			shopType: form.shopType || null,
			price,
			originalPrice,
			currency: form.currency.trim() || null,
			affiliateUrl: form.affiliateUrl.trim()
		};
		saving = true;
		try {
			const updated = await api.updateProduct(product.id, input);
			notify('success', 'บันทึกการแก้ไขแล้ว', updated.productName);
			onsaved(updated);
		} catch (err) {
			error = errorMessage(err);
		} finally {
			saving = false;
		}
	}
</script>

<Modal title="แก้ไขสินค้า" {onclose}>
	<form id="edit-product" class="grid gap-4 sm:grid-cols-2" onsubmit={save}>
		<div class="sm:col-span-2">
			<label class="label" for="f-name">ชื่อสินค้า</label>
			<input id="f-name" class="input" bind:value={form.productName} maxlength={500} required />
		</div>
		<div class="sm:col-span-2">
			<label class="label" for="f-img">รูปสินค้า (URL)</label>
			<input id="f-img" class="input" type="url" bind:value={form.productImage} />
		</div>
		<div>
			<label class="label" for="f-shop">ชื่อร้าน</label>
			<input id="f-shop" class="input" bind:value={form.shopName} maxlength={255} />
		</div>
		<div>
			<label class="label" for="f-type">ประเภทร้าน</label>
			<select id="f-type" class="input" bind:value={form.shopType}>
				<option value="">ไม่ระบุ</option>
				{#each SHOP_TYPES as t}<option value={t}>{SHOP_TYPE_LABEL[t]}</option>{/each}
			</select>
		</div>
		<div>
			<label class="label" for="f-price">ราคา</label>
			<input id="f-price" class="input" inputmode="decimal" bind:value={form.price} />
		</div>
		<div>
			<label class="label" for="f-oprice">ราคาเดิม</label>
			<input id="f-oprice" class="input" inputmode="decimal" bind:value={form.originalPrice} />
		</div>
		<div>
			<label class="label" for="f-cur">สกุลเงิน</label>
			<input id="f-cur" class="input uppercase" maxlength={3} bind:value={form.currency} placeholder="THB" />
		</div>
		<div class="sm:col-span-2">
			<label class="label" for="f-aff">Affiliate URL</label>
			<input id="f-aff" class="input" type="url" bind:value={form.affiliateUrl} required />
		</div>
		{#if error}<p class="text-sm text-rose-600 sm:col-span-2" role="alert">{error}</p>{/if}
	</form>
	{#snippet footer()}
		<button class="btn-secondary" onclick={onclose} disabled={saving}>ยกเลิก</button>
		<button class="btn-primary" type="submit" form="edit-product" disabled={saving}>{#if saving}<Spinner />{/if} บันทึก</button>
	{/snippet}
</Modal>
