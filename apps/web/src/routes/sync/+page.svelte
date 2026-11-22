<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { SYNC_STATUSES, roleAtLeast } from '@affiliate/shared';
  import Badge from '$lib/components/Badge.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import { formatDate } from '$lib/format';

  let { data, form } = $props();
  let canEdit = $derived(data.user ? roleAtLeast(data.user.role, 'EDITOR') : false);
  let inFlight = $derived(data.jobs.data.some((j) => j.status === 'QUEUED' || j.status === 'RUNNING'));

  // auto-refresh while jobs are running
  $effect(() => {
    if (!inFlight) return;
    const t = setInterval(() => void invalidateAll(), 5000);
    return () => clearInterval(t);
  });

  const stat = (s: Record<string, unknown>, k: string) => (typeof s[k] === 'number' ? (s[k] as number) : 0);
</script>

<svelte:head><title>ซิงค์ข้อมูล · Affiliate Admin</title></svelte:head>

<h1 class="mb-4 text-xl font-semibold">ซิงค์ข้อมูล</h1>
<FormMessage {form} />

<div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
  {#each ['waiting', 'active', 'delayed', 'failed', 'completed'] as k (k)}
    <StatCard label="Queue: {k}" value={data.queue[k] ?? 0} />
  {/each}
</div>

{#if canEdit}
  <form method="POST" action="?/trigger" class="card mb-4 grid gap-3 md:grid-cols-6" use:enhance>
    <div class="md:col-span-2">
      <label class="label" for="accountId">บัญชี</label>
      <select class="input" id="accountId" name="accountId" required>
        {#each data.accounts.filter((a) => a.status === 'ACTIVE') as a (a.id)}<option value={a.id}>{a.name} ({a.marketplace})</option>{/each}
      </select>
    </div>
    <div>
      <label class="label" for="type">ประเภท</label>
      <select class="input" id="type" name="type"><option value="PRODUCTS">สินค้า</option><option value="PRICES">อัปเดตราคา</option></select>
    </div>
    <div><label class="label" for="keyword">คีย์เวิร์ด (Shopee)</label><input class="input" id="keyword" name="keyword" maxlength="100" /></div>
    <div><label class="label" for="cat">Category ID</label><input class="input" id="cat" name="categoryExternalId" inputmode="numeric" pattern="\d+" /></div>
    <div><label class="label" for="maxPages">จำนวนหน้า</label><input class="input" id="maxPages" name="maxPages" type="number" min="1" max="50" value="5" /></div>
    <div class="md:col-span-6"><button class="btn-primary">ซิงค์ทันที</button></div>
  </form>
{/if}

<section class="card overflow-x-auto">
  <div class="mb-3 flex flex-wrap gap-2 text-sm">
    <a href="/sync" class={data.status === '' ? 'font-semibold text-brand-700' : 'text-slate-600'}>ทั้งหมด</a>
    {#each SYNC_STATUSES as s (s)}<a href="?status={s}" class={data.status === s ? 'font-semibold text-brand-700' : 'text-slate-600'}>{s}</a>{/each}
  </div>
  <table class="data-table">
    <thead><tr><th>บัญชี</th><th>ประเภท</th><th>ทริกเกอร์</th><th>สถานะ</th><th>ผลลัพธ์</th><th>ครั้งที่</th><th>สร้าง/เสร็จ</th><th></th></tr></thead>
    <tbody>
      {#each data.jobs.data as j (j.id)}
        <tr>
          <td>{j.accountName} <Badge value={j.marketplace} /></td>
          <td>{j.type}{#if typeof j.params.keyword === 'string'}<br /><span class="text-xs text-slate-500">"{j.params.keyword}"</span>{/if}</td>
          <td class="text-xs">{j.trigger}</td>
          <td><Badge value={j.status} /></td>
          <td class="text-xs">
            ดึง {stat(j.stats, 'fetched')} · ใหม่ {stat(j.stats, 'created')} · อัปเดต {stat(j.stats, 'updated')} · ราคาเปลี่ยน {stat(j.stats, 'priceChanges')}
            {#if j.error}<p class="mt-1 max-w-sm text-red-600">{j.error}</p>{/if}
          </td>
          <td class="text-center">{j.attempts}</td>
          <td class="text-xs text-slate-500">{formatDate(j.createdAt)}<br />{formatDate(j.finishedAt)}</td>
          <td>
            {#if canEdit && (j.status === 'FAILED' || j.status === 'CANCELLED')}
              <form method="POST" action="?/retry" use:enhance><input type="hidden" name="id" value={j.id} /><button class="btn-secondary">ลองใหม่</button></form>
            {:else if canEdit && j.status === 'QUEUED'}
              <form method="POST" action="?/cancel" use:enhance><input type="hidden" name="id" value={j.id} /><button class="btn-secondary">ยกเลิก</button></form>
            {/if}
          </td>
        </tr>
      {:else}
        <tr><td colspan="8" class="text-slate-500">ยังไม่มีงาน</td></tr>
      {/each}
    </tbody>
  </table>
  <Pagination meta={data.jobs.meta} />
</section>
