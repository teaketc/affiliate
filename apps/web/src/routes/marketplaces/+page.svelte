<script lang="ts">
  import { enhance } from '$app/forms';
  import { roleAtLeast } from '@affiliate/shared';
  import Badge from '$lib/components/Badge.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';

  let { data, form } = $props();
  let isAdmin = $derived(data.user ? roleAtLeast(data.user.role, 'ADMIN') : false);
</script>

<svelte:head><title>Marketplace · Affiliate Admin</title></svelte:head>

<h1 class="mb-4 text-xl font-semibold">Marketplace</h1>
<FormMessage {form} />

<div class="grid gap-4 md:grid-cols-2">
  {#each data.providers as p (p.id)}
    <form method="POST" action="?/update" class="card space-y-3" use:enhance>
      <input type="hidden" name="id" value={p.id} />
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2"><Badge value={p.code} /><h2 class="font-medium">{p.name}</h2></div>
        <Badge value={p.isEnabled ? 'ACTIVE' : 'DISABLED'} />
      </div>
      <p class="text-xs break-all text-slate-500">{p.baseUrl}</p>
      <p class="text-sm text-slate-600">{p.accountCount} บัญชี · {p.productCount} สินค้า</p>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="rl-{p.id}">Rate limit (req/s)</label>
          <input class="input" id="rl-{p.id}" name="rateLimitPerSec" type="number" min="1" max="100" value={p.rateLimitPerSec} disabled={!isAdmin} />
        </div>
        <label class="flex items-end gap-2 text-sm">
          <input type="checkbox" name="isEnabled" checked={p.isEnabled} disabled={!isAdmin} /> เปิดใช้งาน
        </label>
      </div>
      {#if isAdmin}<button class="btn-primary">บันทึก</button>{/if}
    </form>
  {/each}
</div>

<p class="mt-4 text-xs text-slate-500">
  Rate limit ถูกบังคับใช้ร่วมกันทุก process ผ่าน Redis (API + Worker) เพื่อไม่ให้เกินโควตาของ Marketplace
</p>
