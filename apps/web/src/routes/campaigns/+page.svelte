<script lang="ts">
  import { enhance } from '$app/forms';
  import { CAMPAIGN_STATUSES, roleAtLeast } from '@affiliate/shared';
  import Badge from '$lib/components/Badge.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import { formatDate, formatMoney } from '$lib/format';

  let { data, form } = $props();
  let canEdit = $derived(data.user ? roleAtLeast(data.user.role, 'EDITOR') : false);
  let accountName = $derived(new Map(data.accounts.map((a) => [a.id, `${a.name} (${a.marketplace})`])));
</script>

<svelte:head><title>แคมเปญ · Affiliate Admin</title></svelte:head>

<h1 class="mb-4 text-xl font-semibold">แคมเปญ</h1>
<FormMessage {form} />

<div class="grid gap-4 lg:grid-cols-3">
  <section class="card overflow-x-auto lg:col-span-2">
    <table class="data-table">
      <thead><tr><th>แคมเปญ</th><th>บัญชี</th><th>สถานะ</th><th class="text-right">ลิงก์/คลิก</th><th>ช่วงเวลา</th></tr></thead>
      <tbody>
        {#each data.campaigns.data as c (c.id)}
          <tr>
            <td><b>{c.name}</b><br /><code class="text-xs text-slate-500">{c.code}</code>{#if c.budget}<span class="ml-2 text-xs text-slate-500">งบ {formatMoney(c.budget)}</span>{/if}</td>
            <td class="text-xs">{accountName.get(c.accountId) ?? c.accountId}</td>
            <td>
              {#if canEdit}
                <form method="POST" action="?/status" use:enhance>
                  <input type="hidden" name="id" value={c.id} />
                  <select class="input py-1 text-xs" name="status" value={c.status} onchange={(e) => e.currentTarget.form?.requestSubmit()}>
                    {#each CAMPAIGN_STATUSES as s (s)}<option>{s}</option>{/each}
                  </select>
                </form>
              {:else}<Badge value={c.status} />{/if}
            </td>
            <td class="text-right tabular-nums">{c.linkCount} / {c.clickCount}</td>
            <td class="text-xs text-slate-500">{formatDate(c.startsAt)}<br />{formatDate(c.endsAt)}</td>
          </tr>
        {:else}
          <tr><td colspan="5" class="text-slate-500">ยังไม่มีแคมเปญ</td></tr>
        {/each}
      </tbody>
    </table>
    <Pagination meta={data.campaigns.meta} />
  </section>

  {#if canEdit}
    <form method="POST" action="?/create" class="card space-y-3" use:enhance>
      <h2 class="font-medium">สร้างแคมเปญ</h2>
      <div>
        <label class="label" for="accountId">บัญชี</label>
        <select class="input" id="accountId" name="accountId" required>
          {#each data.accounts as a (a.id)}<option value={a.id}>{a.name} ({a.marketplace})</option>{/each}
        </select>
      </div>
      <div><label class="label" for="name">ชื่อ</label><input class="input" id="name" name="name" required maxlength="120" /></div>
      <div>
        <label class="label" for="code">โค้ด (ใช้เป็น Sub ID แรก)</label>
        <input class="input" id="code" name="code" required pattern="[A-Za-z0-9_\-]{'{1,50}'}" placeholder="SUMMER26" />
      </div>
      <div><label class="label" for="description">รายละเอียด</label><textarea class="input" id="description" name="description" rows="2"></textarea></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="label" for="startsAt">เริ่ม</label><input class="input" id="startsAt" name="startsAt" type="datetime-local" /></div>
        <div><label class="label" for="endsAt">สิ้นสุด</label><input class="input" id="endsAt" name="endsAt" type="datetime-local" /></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="label" for="budget">งบประมาณ</label><input class="input" id="budget" name="budget" inputmode="decimal" pattern="\d+(\.\d{'{1,2}'})?" /></div>
        <div>
          <label class="label" for="status">สถานะ</label>
          <select class="input" id="status" name="status">{#each CAMPAIGN_STATUSES as s (s)}<option>{s}</option>{/each}</select>
        </div>
      </div>
      <button class="btn-primary w-full" disabled={data.accounts.length === 0}>สร้าง</button>
    </form>
  {/if}
</div>
