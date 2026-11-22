<script lang="ts">
  import Badge from '$lib/components/Badge.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import { formatMoney, formatRate } from '$lib/format';

  let { data } = $props();
  let q = $derived(data.query);

  const sorts = [
    ['', 'ล่าสุด'],
    ['relevance', 'เกี่ยวข้อง'],
    ['price_asc', 'ราคาต่ำ → สูง'],
    ['price_desc', 'ราคาสูง → ต่ำ'],
    ['discount_desc', 'ส่วนลดสูงสุด'],
    ['commission_desc', 'คอมมิชชันสูงสุด'],
    ['sales_desc', 'ขายดี']
  ] as const;
</script>

<svelte:head><title>สินค้า · Affiliate Admin</title></svelte:head>

<h1 class="mb-4 text-xl font-semibold">สินค้า</h1>

<form method="GET" class="card mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
  <div class="col-span-2">
    <label class="label" for="q">ค้นหา</label>
    <input class="input" id="q" name="q" value={q.q ?? ''} placeholder="ชื่อสินค้า / แบรนด์ / ร้าน" />
  </div>
  <div>
    <label class="label" for="marketplace">Marketplace</label>
    <select class="input" id="marketplace" name="marketplace" value={q.marketplace ?? ''}>
      <option value="">ทั้งหมด</option><option>SHOPEE</option><option>LAZADA</option>
    </select>
  </div>
  <div>
    <label class="label" for="categoryId">หมวดหมู่</label>
    <select class="input" id="categoryId" name="categoryId" value={q.categoryId ?? ''}>
      <option value="">ทั้งหมด</option>
      {#each data.categories as c (c.id)}<option value={c.id}>{'— '.repeat(c.level - 1)}{c.name} ({c.productCount})</option>{/each}
    </select>
  </div>
  <div>
    <label class="label" for="minPrice">ราคาต่ำสุด</label>
    <input class="input" id="minPrice" name="minPrice" type="number" min="0" step="0.01" value={q.minPrice ?? ''} />
  </div>
  <div>
    <label class="label" for="maxPrice">ราคาสูงสุด</label>
    <input class="input" id="maxPrice" name="maxPrice" type="number" min="0" step="0.01" value={q.maxPrice ?? ''} />
  </div>
  <div>
    <label class="label" for="minDiscount">ส่วนลด ≥ (%)</label>
    <input class="input" id="minDiscount" name="minDiscount" type="number" min="0" max="100" value={q.minDiscount ?? ''} />
  </div>
  <div>
    <label class="label" for="minCommission">คอมฯ ≥ (%)</label>
    <input class="input" id="minCommission" name="minCommission" type="number" min="0" max="100" step="0.1" value={q.minCommission ?? ''} />
  </div>
  <div class="col-span-2 md:col-span-2">
    <label class="label" for="sort">เรียงตาม</label>
    <select class="input" id="sort" name="sort" value={q.sort ?? ''}>
      {#each sorts as [v, l] (v)}<option value={v}>{l}</option>{/each}
    </select>
  </div>
  <div class="col-span-2 flex items-end gap-2">
    <button class="btn-primary flex-1">กรอง</button>
    <a href="/products" class="btn-secondary">ล้าง</a>
  </div>
</form>

<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {#each data.products.data as p (p.id)}
    <a href="/products/{p.id}" class="card flex gap-3 transition hover:border-brand-500">
      {#if p.imageUrl}
        <img src={p.imageUrl} alt="" class="h-20 w-20 flex-none rounded-lg bg-slate-100 object-cover" loading="lazy" />
      {:else}
        <div class="h-20 w-20 flex-none rounded-lg bg-slate-100"></div>
      {/if}
      <div class="min-w-0 flex-1">
        <p class="line-clamp-2 text-sm font-medium">{p.name}</p>
        <p class="mt-1 text-sm">
          <b>{formatMoney(p.price, p.currency)}</b>
          {#if p.originalPrice}<s class="ml-1 text-xs text-slate-400">{formatMoney(p.originalPrice, p.currency)}</s>{/if}
        </p>
        <div class="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          <Badge value={p.marketplace} />
          {#if Number(p.discountRate) > 0}<span class="text-red-600">-{formatRate(p.discountRate, 0)}</span>{/if}
          <span>คอมฯ {formatRate(p.commissionRate)}</span>
        </div>
      </div>
    </a>
  {:else}
    <p class="col-span-full py-10 text-center text-slate-500">ไม่พบสินค้า — ลองซิงค์ข้อมูลจากหน้า "ซิงค์ข้อมูล"</p>
  {/each}
</div>

<Pagination meta={data.products.meta} />
