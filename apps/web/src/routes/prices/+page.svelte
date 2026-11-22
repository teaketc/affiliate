<script lang="ts">
  import Badge from '$lib/components/Badge.svelte';
  import { formatDate, formatMoney, formatRate } from '$lib/format';

  let { data } = $props();
</script>

<svelte:head><title>ติดตามราคา · Affiliate Admin</title></svelte:head>

<h1 class="mb-4 text-xl font-semibold">ติดตามราคา</h1>

<section class="card mb-4">
  <h2 class="mb-2 font-medium">เปรียบเทียบราคา</h2>
  <form method="GET" class="flex flex-col gap-2 sm:flex-row">
    <input class="input" name="ids" value={data.ids} placeholder="Product IDs คั่นด้วย , (2–10 รายการ)" />
    <button class="btn-primary">เปรียบเทียบ</button>
  </form>
  {#if typeof data.compare === 'string'}
    <p class="mt-2 text-sm text-red-600">{data.compare}</p>
  {:else if data.compare}
    <div class="mt-3 overflow-x-auto">
      <table class="data-table">
        <thead><tr><th>#</th><th>สินค้า</th><th>Marketplace</th><th class="text-right">ราคา</th><th class="text-right">ส่วนลด</th><th class="text-right">คอมฯ</th></tr></thead>
        <tbody>
          {#each data.compare as p, i (p.id)}
            <tr class={i === 0 ? 'bg-emerald-50' : ''}>
              <td>{i + 1}</td>
              <td><a href="/products/{p.id}" class="text-brand-600">{p.name}</a></td>
              <td><Badge value={p.marketplace} /></td>
              <td class="text-right font-medium">{formatMoney(p.price, p.currency)}</td>
              <td class="text-right">{formatRate(p.discountRate)}</td>
              <td class="text-right">{formatRate(p.commissionRate)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<div class="grid gap-4 lg:grid-cols-2">
  <section class="card overflow-x-auto">
    <h2 class="mb-2 font-medium">ส่วนลดสูงสุด</h2>
    <table class="data-table">
      <thead><tr><th>สินค้า</th><th class="text-right">ราคา</th><th class="text-right">ส่วนลด</th></tr></thead>
      <tbody>
        {#each data.discounted.data as p (p.id)}
          <tr>
            <td class="max-w-xs truncate"><a href="/products/{p.id}" class="text-brand-600">{p.name}</a></td>
            <td class="text-right">{formatMoney(p.price, p.currency)}{#if p.originalPrice}<br /><s class="text-xs text-slate-400">{formatMoney(p.originalPrice, p.currency)}</s>{/if}</td>
            <td class="text-right text-red-600">-{formatRate(p.discountRate, 0)}</td>
          </tr>
        {:else}<tr><td colspan="3" class="text-slate-500">ไม่มีสินค้าลดราคา</td></tr>{/each}
      </tbody>
    </table>
  </section>
  <section class="card overflow-x-auto">
    <h2 class="mb-2 font-medium">โปรโมชันที่กำลังดำเนินอยู่</h2>
    <table class="data-table">
      <thead><tr><th>โปรโมชัน</th><th>คอมฯ</th><th>สิ้นสุด</th></tr></thead>
      <tbody>
        {#each data.promotions.data as pr (pr.id)}
          <tr>
            <td><a href="/products/{pr.productId}" class="text-brand-600">{pr.name}</a><br /><span class="text-xs text-slate-500">{pr.type}</span></td>
            <td>{formatRate(pr.commissionRate)}</td>
            <td class="text-xs text-slate-500">{formatDate(pr.endsAt)}</td>
          </tr>
        {:else}<tr><td colspan="3" class="text-slate-500">ไม่มีโปรโมชัน</td></tr>{/each}
      </tbody>
    </table>
  </section>
</div>
