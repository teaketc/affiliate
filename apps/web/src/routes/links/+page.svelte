<script lang="ts">
  import { enhance } from '$app/forms';
  import { roleAtLeast } from '@affiliate/shared';
  import Badge from '$lib/components/Badge.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import { formatDate } from '$lib/format';

  let { data, form } = $props();
  let canEdit = $derived(data.user ? roleAtLeast(data.user.role, 'EDITOR') : false);
  let accountId = $state('');
  let campaigns = $derived(data.campaigns.filter((c) => c.accountId === accountId && c.status !== 'ENDED'));
</script>

<svelte:head><title>ลิงก์ Affiliate · Affiliate Admin</title></svelte:head>

<h1 class="mb-4 text-xl font-semibold">ลิงก์ Affiliate</h1>
<FormMessage {form} />

{#if canEdit}
  <form method="POST" action="?/generate" class="card mb-4 grid gap-3 md:grid-cols-5" use:enhance>
    <div>
      <label class="label" for="g-account">บัญชี</label>
      <select class="input" id="g-account" name="accountId" bind:value={accountId} required>
        <option value="" disabled>เลือก…</option>
        {#each data.accounts.filter((a) => a.status === 'ACTIVE') as a (a.id)}<option value={a.id}>{a.name} ({a.marketplace})</option>{/each}
      </select>
    </div>
    <div class="md:col-span-2">
      <label class="label" for="g-url">URL สินค้า (Shopee/Lazada)</label>
      <input class="input" id="g-url" name="originUrl" type="url" required placeholder="https://shopee.co.th/…" />
    </div>
    <div>
      <label class="label" for="g-camp">แคมเปญ</label>
      <select class="input" id="g-camp" name="campaignId"><option value="">—</option>{#each campaigns as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select>
    </div>
    <div>
      <label class="label" for="g-sub">Sub IDs</label>
      <input class="input" id="g-sub" name="subIds" placeholder="line,oa01" />
    </div>
    <div class="md:col-span-5"><button class="btn-primary">สร้างลิงก์จาก URL</button></div>
  </form>
{/if}

<section class="card overflow-x-auto">
  <form method="GET" class="mb-3 flex flex-wrap gap-2">
    <select class="input w-auto" name="accountId" value={data.filter.accountId}>
      <option value="">ทุกบัญชี</option>{#each data.accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
    </select>
    <select class="input w-auto" name="campaignId" value={data.filter.campaignId}>
      <option value="">ทุกแคมเปญ</option>{#each data.campaigns as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
    </select>
    <button class="btn-secondary">กรอง</button>
  </form>
  <table class="data-table">
    <thead><tr><th>สินค้า / URL</th><th>Marketplace</th><th>แคมเปญ</th><th>Sub IDs</th><th>Tracking URL</th><th class="text-right">คลิก</th><th>สร้างเมื่อ</th></tr></thead>
    <tbody>
      {#each data.links.data as l (l.id)}
        <tr>
          <td class="max-w-xs truncate">{l.productName ?? l.originUrl}</td>
          <td><Badge value={l.marketplace} /></td>
          <td class="text-xs">{l.campaignName ?? '—'}</td>
          <td class="text-xs">{l.subIds.join(', ') || '—'}</td>
          <td class="text-xs break-all"><a href={l.trackingUrl} class="text-brand-600" target="_blank" rel="noopener noreferrer">{l.trackingUrl}</a></td>
          <td class="text-right tabular-nums">{l.clickCount}</td>
          <td class="text-xs text-slate-500">{formatDate(l.createdAt)}</td>
        </tr>
      {:else}
        <tr><td colspan="7" class="text-slate-500">ยังไม่มีลิงก์</td></tr>
      {/each}
    </tbody>
  </table>
  <Pagination meta={data.links.meta} />
</section>
