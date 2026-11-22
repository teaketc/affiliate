<script lang="ts">
  import { enhance } from '$app/forms';
  import { roleAtLeast } from '@affiliate/shared';
  import Badge from '$lib/components/Badge.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import LineChart from '$lib/components/LineChart.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import { formatDate, formatMoney, formatRate } from '$lib/format';

  let { data, form } = $props();
  let p = $derived(data.product);
  let h = $derived(data.history);
  let canGenerate = $derived(data.user ? roleAtLeast(data.user.role, 'EDITOR') : false);
  let copied = $state(false);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<svelte:head><title>{p.name} · Affiliate Admin</title></svelte:head>

<a href="/products" class="text-sm text-brand-600">← กลับไปหน้าสินค้า</a>

<div class="mt-3 grid gap-4 lg:grid-cols-3">
  <section class="card lg:col-span-2">
    <div class="flex flex-col gap-4 sm:flex-row">
      {#if p.images.length || p.imageUrl}
        <img src={p.images[0]?.url ?? p.imageUrl} alt="" class="h-40 w-40 flex-none rounded-lg bg-slate-100 object-cover" />
      {/if}
      <div class="min-w-0">
        <div class="flex items-center gap-2"><Badge value={p.marketplace} /><span class="text-xs text-slate-500">ID {p.externalId}</span></div>
        <h1 class="mt-1 text-lg font-semibold">{p.name}</h1>
        <p class="text-sm text-slate-500">{p.brandName ?? ''} {p.shopName ? `· ${p.shopName}` : ''}</p>
        <p class="mt-2 text-2xl font-semibold">
          {formatMoney(p.price, p.currency)}
          {#if p.originalPrice}<s class="ml-2 text-sm text-slate-400">{formatMoney(p.originalPrice, p.currency)}</s>{/if}
        </p>
        <p class="mt-1 text-sm text-slate-600">
          ส่วนลด {formatRate(p.discountRate)} · คอมมิชชัน {formatRate(p.commissionRate)}
          {#if p.commissionAmount}({formatMoney(p.commissionAmount, p.currency)}){/if}
          · ขายแล้ว {p.salesCount}
        </p>
        <a href={p.productUrl} target="_blank" rel="noopener noreferrer" class="mt-2 inline-block text-sm text-brand-600">เปิดหน้าสินค้า ↗</a>
        <p class="mt-1 text-xs text-slate-400">ซิงค์ล่าสุด {formatDate(p.lastSyncedAt)}</p>
      </div>
    </div>

    {#if p.categories.length}
      <div class="mt-4 flex flex-wrap gap-1">{#each p.categories as c (c.id)}<span class="rounded bg-slate-100 px-2 py-0.5 text-xs">{c.name}</span>{/each}</div>
    {/if}

    {#if p.variants.length}
      <h2 class="mt-6 mb-2 font-medium">ตัวเลือกสินค้า</h2>
      <table class="data-table"><thead><tr><th>ชื่อ</th><th class="text-right">ราคา</th></tr></thead>
        <tbody>{#each p.variants as v (v.id)}<tr><td>{v.name}</td><td class="text-right">{formatMoney(v.price, p.currency)}</td></tr>{/each}</tbody>
      </table>
    {/if}

    <h2 class="mt-6 mb-2 font-medium">ประวัติราคา (90 วัน)</h2>
    <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatCard label="ปัจจุบัน" value={formatMoney(h.current, h.currency)} />
      <StatCard label="ต่ำสุด" value={formatMoney(h.lowest, h.currency)} />
      <StatCard label="สูงสุด" value={formatMoney(h.highest, h.currency)} />
      <StatCard label="เฉลี่ย" value={formatMoney(h.average, h.currency)} />
    </div>
    <LineChart label="Price history" points={h.points.map((pt) => ({ x: pt.recordedAt.slice(0, 10), y: Number(pt.price) }))} format={(v) => v.toFixed(0)} />

    {#if p.promotions.length}
      <h2 class="mt-6 mb-2 font-medium">โปรโมชัน</h2>
      <ul class="space-y-1 text-sm">
        {#each p.promotions as pr (pr.id)}
          <li><b>{pr.name}</b> <span class="text-slate-500">({pr.type}) {formatDate(pr.startsAt)} – {formatDate(pr.endsAt)}</span> {#if pr.commissionRate}· คอมฯ {formatRate(pr.commissionRate)}{/if}</li>
        {/each}
      </ul>
    {/if}
  </section>

  <aside class="space-y-4">
    {#if canGenerate}
      <form method="POST" action="?/generate" class="card space-y-3" use:enhance>
        <h2 class="font-medium">สร้างลิงก์ Affiliate</h2>
        <FormMessage {form} />
        {#if data.accounts.length === 0}
          <p class="text-sm text-slate-500">ยังไม่มีบัญชี {p.marketplace} ที่ใช้งานได้ — <a href="/accounts" class="text-brand-600">เพิ่มบัญชี</a></p>
        {:else}
          <div>
            <label class="label" for="accountId">บัญชี</label>
            <select class="input" id="accountId" name="accountId" required>
              {#each data.accounts as a (a.id)}<option value={a.id}>{a.name} ({a.region})</option>{/each}
            </select>
          </div>
          <div>
            <label class="label" for="campaignId">แคมเปญ (ไม่บังคับ)</label>
            <select class="input" id="campaignId" name="campaignId">
              <option value="">— ไม่มี —</option>
              {#each data.campaigns.filter((c) => data.accounts.some((a) => a.id === c.accountId)) as c (c.id)}<option value={c.id}>{c.name} [{c.code}]</option>{/each}
            </select>
          </div>
          <div>
            <label class="label" for="subIds">Sub IDs (คั่นด้วย ,)</label>
            <input class="input" id="subIds" name="subIds" placeholder="facebook,post123" />
          </div>
          <button class="btn-primary w-full">สร้างลิงก์</button>
        {/if}
        {#if form && 'link' in form && form.link}
          <div class="rounded-lg bg-emerald-50 p-3 text-sm">
            <p class="font-medium text-emerald-800">สร้างลิงก์สำเร็จ</p>
            <p class="mt-1 break-all text-xs">Tracking: {form.link.trackingUrl}</p>
            <p class="break-all text-xs text-slate-500">Marketplace: {form.link.shortLink}</p>
            <button type="button" class="btn-secondary mt-2" onclick={() => form && 'link' in form && form.link && copy(form.link.trackingUrl)}>{copied ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}</button>
          </div>
        {/if}
      </form>
    {/if}

    <section class="card">
      <h2 class="mb-2 font-medium">ลิงก์ของสินค้านี้</h2>
      <ul class="space-y-2 text-sm">
        {#each data.links as l (l.id)}
          <li class="break-all"><span class="text-xs text-slate-500">{formatDate(l.createdAt)} · {l.clickCount} คลิก</span><br />{l.trackingUrl}</li>
        {:else}
          <li class="text-slate-500">ยังไม่มีลิงก์</li>
        {/each}
      </ul>
    </section>
  </aside>
</div>
