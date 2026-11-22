<script lang="ts">
  import { enhance } from '$app/forms';
  import { roleAtLeast } from '@affiliate/shared';
  import Badge from '$lib/components/Badge.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import { formatDate } from '$lib/format';

  let { data, form } = $props();
  let isAdmin = $derived(data.user ? roleAtLeast(data.user.role, 'ADMIN') : false);
  let marketplace = $state<'SHOPEE' | 'LAZADA'>('LAZADA');
  let region = $state('TH');

  const shopeeTld: Record<string, string> = { TH: 'co.th', SG: 'sg', MY: 'com.my', PH: 'ph', VN: 'vn', ID: 'co.id' };
  const lazadaTld: Record<string, string> = { TH: 'co.th', SG: 'sg', MY: 'com.my', PH: 'com.ph', VN: 'vn', ID: 'co.id' };
  let endpoint = $derived(
    marketplace === 'SHOPEE'
      ? `https://open-api.affiliate.shopee.${shopeeTld[region] ?? 'co.th'}/graphql`
      : `https://api.lazada.${lazadaTld[region] ?? 'co.th'}/rest`
  );
</script>

<svelte:head><title>บัญชี Affiliate · Affiliate Admin</title></svelte:head>

<h1 class="mb-4 text-xl font-semibold">บัญชี Affiliate</h1>
<FormMessage {form} />

<div class="grid gap-4 lg:grid-cols-3">
  <section class="card overflow-x-auto lg:col-span-2">
    <table class="data-table">
      <thead><tr><th>ชื่อ</th><th>Marketplace</th><th>ภูมิภาค</th><th>สถานะ</th><th>ซิงค์ล่าสุด</th><th></th></tr></thead>
      <tbody>
        {#each data.accounts as a (a.id)}
          <tr>
            <td class="font-medium">{a.name}<br /><span class="text-xs break-all text-slate-400">{a.endpoint}</span></td>
            <td><Badge value={a.marketplace} /></td>
            <td>{a.region}</td>
            <td><Badge value={a.status} /></td>
            <td class="text-xs text-slate-500">{formatDate(a.lastSyncedAt)}</td>
            <td class="whitespace-nowrap">
              {#if isAdmin}
                <form method="POST" action="?/test" use:enhance class="inline"><input type="hidden" name="id" value={a.id} /><button class="btn-secondary">ทดสอบ</button></form>
                <form method="POST" action="?/status" use:enhance class="inline">
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="status" value={a.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'} />
                  <button class="btn-secondary">{a.status === 'ACTIVE' ? 'ปิด' : 'เปิด'}</button>
                </form>
              {/if}
            </td>
          </tr>
        {:else}
          <tr><td colspan="6" class="text-slate-500">ยังไม่มีบัญชี</td></tr>
        {/each}
      </tbody>
    </table>
  </section>

  {#if isAdmin}
    <form method="POST" action="?/create" class="card space-y-3" use:enhance autocomplete="off">
      <h2 class="font-medium">เพิ่มบัญชี</h2>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="marketplace">Marketplace</label>
          <select class="input" id="marketplace" name="marketplace" bind:value={marketplace}><option>LAZADA</option><option>SHOPEE</option></select>
        </div>
        <div>
          <label class="label" for="region">ภูมิภาค</label>
          <select class="input" id="region" name="region" bind:value={region}>
            {#each ['TH', 'SG', 'MY', 'PH', 'VN', 'ID'] as r (r)}<option>{r}</option>{/each}
          </select>
        </div>
      </div>
      <div><label class="label" for="name">ชื่อบัญชี</label><input class="input" id="name" name="name" required maxlength="100" /></div>
      <div>
        <label class="label" for="endpoint">Endpoint</label>
        <input class="input" id="endpoint" name="endpoint" value={endpoint} required />
        <p class="mt-1 text-xs text-slate-500">อนุญาตเฉพาะโฮสต์ทางการของ Marketplace</p>
      </div>
      {#if marketplace === 'SHOPEE'}
        <div><label class="label" for="appId">App ID</label><input class="input" id="appId" name="appId" required /></div>
        <div><label class="label" for="secret">Secret</label><input class="input" id="secret" name="secret" type="password" required /></div>
      {:else}
        <div><label class="label" for="appKey">App Key</label><input class="input" id="appKey" name="appKey" required /></div>
        <div><label class="label" for="appSecret">App Secret</label><input class="input" id="appSecret" name="appSecret" type="password" required /></div>
        <div><label class="label" for="userToken">Affiliate userToken</label><input class="input" id="userToken" name="userToken" type="password" required /></div>
      {/if}
      <p class="text-xs text-slate-500">Credentials ถูกเข้ารหัส AES-256-GCM ที่ฝั่ง API และจะไม่ถูกส่งกลับมาแสดงอีก</p>
      <button class="btn-primary w-full">บันทึก</button>
    </form>
  {/if}
</div>
