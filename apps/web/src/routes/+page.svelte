<script lang="ts">
  import Badge from '$lib/components/Badge.svelte';
  import LineChart from '$lib/components/LineChart.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import { formatDate, formatNumber, formatRate } from '$lib/format';

  let { data } = $props();
  let o = $derived(data.overview);
</script>

<svelte:head><title>ภาพรวม · Affiliate Admin</title></svelte:head>

<h1 class="mb-4 text-xl font-semibold">ภาพรวม</h1>

<div class="grid grid-cols-2 gap-3 md:grid-cols-5">
  <StatCard label="สินค้า" value={formatNumber(o.totals.products)} />
  <StatCard label="บัญชีที่ใช้งาน" value={o.totals.activeAccounts} />
  <StatCard label="ลิงก์ Affiliate" value={formatNumber(o.totals.links)} />
  <StatCard label="คลิก (30 วัน)" value={formatNumber(o.totals.clicks)} />
  <StatCard label="แคมเปญที่ใช้งาน" value={o.totals.activeCampaigns} />
</div>

<div class="mt-4 grid gap-4 lg:grid-cols-3">
  <section class="card lg:col-span-2">
    <h2 class="mb-2 font-medium">คลิกรายวัน (30 วัน)</h2>
    <LineChart label="Clicks per day" points={o.clicksByDay.map((d) => ({ x: d.date.slice(5), y: d.clicks }))} />
  </section>
  <section class="card">
    <h2 class="mb-3 font-medium">ตาม Marketplace</h2>
    <ul class="space-y-3">
      {#each o.byMarketplace as m (m.marketplace)}
        <li class="flex items-center justify-between text-sm">
          <Badge value={m.marketplace} />
          <span class="text-slate-600">{formatNumber(m.products)} สินค้า · {formatNumber(m.clicks)} คลิก · คอมฯ เฉลี่ย {formatRate(m.avgCommissionRate)}</span>
        </li>
      {/each}
    </ul>
    <h2 class="mt-6 mb-2 font-medium">Sync 24 ชม.</h2>
    <p class="text-sm text-slate-600">
      สำเร็จ <b>{o.sync.last24h.success}</b> · ล้มเหลว <b class="text-red-600">{o.sync.last24h.failed}</b> · กำลังทำงาน <b>{o.sync.last24h.running}</b>
    </p>
  </section>
</div>

<div class="mt-4 grid gap-4 lg:grid-cols-2">
  <section class="card overflow-x-auto">
    <h2 class="mb-2 font-medium">ลิงก์ยอดนิยม</h2>
    <table class="data-table">
      <thead><tr><th>สินค้า</th><th class="text-right">คลิก</th></tr></thead>
      <tbody>
        {#each o.topLinks as l (l.id)}
          <tr><td class="max-w-xs truncate">{l.productName ?? l.shortLink}</td><td class="text-right tabular-nums">{l.clicks}</td></tr>
        {:else}
          <tr><td colspan="2" class="text-slate-500">ยังไม่มีคลิก</td></tr>
        {/each}
      </tbody>
    </table>
  </section>
  <section class="card overflow-x-auto">
    <div class="mb-2 flex items-center justify-between"><h2 class="font-medium">งานซิงค์ล่าสุด</h2><a href="/sync" class="text-sm text-brand-600">ดูทั้งหมด</a></div>
    <table class="data-table">
      <thead><tr><th>บัญชี</th><th>ประเภท</th><th>สถานะ</th><th>เวลา</th></tr></thead>
      <tbody>
        {#each data.jobs as j (j.id)}
          <tr><td>{j.accountName}</td><td>{j.type}</td><td><Badge value={j.status} /></td><td class="text-xs text-slate-500">{formatDate(j.createdAt)}</td></tr>
        {:else}
          <tr><td colspan="4" class="text-slate-500">ยังไม่มีงานซิงค์</td></tr>
        {/each}
      </tbody>
    </table>
  </section>
</div>
