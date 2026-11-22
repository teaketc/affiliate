<script lang="ts">
  import Badge from '$lib/components/Badge.svelte';
  import LineChart from '$lib/components/LineChart.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import { formatNumber, formatRate } from '$lib/format';

  let { data } = $props();
  let o = $derived(data.overview);
  let totalClicks = $derived(o.clicksByDay.reduce((s, d) => s + d.clicks, 0));
  let maxClicks = $derived(Math.max(1, ...o.byMarketplace.map((m) => m.clicks)));
</script>

<svelte:head><title>Analytics · Affiliate Admin</title></svelte:head>

<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
  <h1 class="text-xl font-semibold">Analytics</h1>
  <div class="flex gap-1">
    {#each data.ranges as r (r)}
      <a href="?days={r}" class={r === data.days ? 'btn-primary' : 'btn-secondary'}>{r} วัน</a>
    {/each}
  </div>
</div>

<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
  <StatCard label="คลิกทั้งหมด" value={formatNumber(totalClicks)} hint="{data.days} วันล่าสุด" />
  <StatCard label="คลิกเฉลี่ย/วัน" value={(totalClicks / Math.max(1, o.clicksByDay.length)).toFixed(1)} />
  <StatCard label="ลิงก์" value={formatNumber(o.totals.links)} />
  <StatCard label="CTR ต่อลิงก์" value={o.totals.links ? (totalClicks / o.totals.links).toFixed(2) : '0'} hint="คลิก ÷ จำนวนลิงก์" />
</div>

<section class="card mt-4">
  <h2 class="mb-2 font-medium">คลิกรายวัน</h2>
  <LineChart label="Clicks per day" points={o.clicksByDay.map((d) => ({ x: d.date, y: d.clicks }))} />
</section>

<div class="mt-4 grid gap-4 lg:grid-cols-2">
  <section class="card">
    <h2 class="mb-3 font-medium">คลิกตาม Marketplace</h2>
    {#each o.byMarketplace as m (m.marketplace)}
      <div class="mb-3">
        <div class="mb-1 flex justify-between text-sm"><Badge value={m.marketplace} /><span>{formatNumber(m.clicks)} คลิก · {formatNumber(m.links)} ลิงก์ · คอมฯ เฉลี่ย {formatRate(m.avgCommissionRate)}</span></div>
        <div class="h-2 rounded bg-slate-100"><div class="h-2 rounded bg-brand-600" style="width: {(m.clicks / maxClicks) * 100}%"></div></div>
      </div>
    {/each}
  </section>
  <section class="card overflow-x-auto">
    <h2 class="mb-2 font-medium">Top 10 ลิงก์</h2>
    <table class="data-table">
      <thead><tr><th>#</th><th>สินค้า</th><th class="text-right">คลิก</th></tr></thead>
      <tbody>
        {#each o.topLinks as l, i (l.id)}
          <tr><td>{i + 1}</td><td class="max-w-xs truncate">{l.productName ?? l.shortLink}</td><td class="text-right tabular-nums">{l.clicks}</td></tr>
        {:else}<tr><td colspan="3" class="text-slate-500">ยังไม่มีข้อมูล</td></tr>{/each}
      </tbody>
    </table>
  </section>
</div>
