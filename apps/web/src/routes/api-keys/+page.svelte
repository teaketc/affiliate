<script lang="ts">
  import { enhance } from '$app/forms';
  import { API_SCOPES } from '@affiliate/shared';
  import Badge from '$lib/components/Badge.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import { formatDate } from '$lib/format';

  let { data, form } = $props();
</script>

<svelte:head><title>API Keys · Affiliate Admin</title></svelte:head>

<h1 class="mb-4 text-xl font-semibold">API Keys</h1>
<FormMessage {form} />

{#if form && 'created' in form && form.created}
  <div class="card mb-4 border-amber-300 bg-amber-50">
    <p class="font-medium text-amber-900">คัดลอก API key "{form.created.name}" ตอนนี้ — จะไม่แสดงอีก</p>
    <code class="mt-2 block rounded bg-white p-2 text-sm break-all select-all">{form.created.key}</code>
    <p class="mt-2 text-xs text-amber-800">ใช้ผ่าน header <code>X-API-Key</code></p>
  </div>
{/if}

<div class="grid gap-4 lg:grid-cols-3">
  <section class="card overflow-x-auto lg:col-span-2">
    <table class="data-table">
      <thead><tr><th>ชื่อ</th><th>Prefix</th><th>Scopes</th><th>Limit/นาที</th><th>ใช้ล่าสุด</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>
        {#each data.keys as k (k.id)}
          <tr>
            <td>{k.name}</td>
            <td><code class="text-xs">{k.prefix}…</code></td>
            <td class="text-xs">{k.scopes.join(', ')}</td>
            <td>{k.rateLimitPerMin}</td>
            <td class="text-xs text-slate-500">{formatDate(k.lastUsedAt)}</td>
            <td><Badge value={k.revokedAt ? 'DISABLED' : k.expiresAt && new Date(k.expiresAt) < new Date() ? 'ENDED' : 'ACTIVE'} /></td>
            <td>
              {#if !k.revokedAt}
                <form method="POST" action="?/revoke" use:enhance={({ cancel }) => { if (!confirm(`เพิกถอน ${k.name}?`)) cancel(); }}>
                  <input type="hidden" name="id" value={k.id} /><button class="btn-danger">เพิกถอน</button>
                </form>
              {/if}
            </td>
          </tr>
        {:else}<tr><td colspan="7" class="text-slate-500">ยังไม่มี API key</td></tr>{/each}
      </tbody>
    </table>
  </section>

  <form method="POST" action="?/create" class="card space-y-3" use:enhance>
    <h2 class="font-medium">สร้าง API key</h2>
    <div><label class="label" for="name">ชื่อ</label><input class="input" id="name" name="name" required maxlength="100" /></div>
    <fieldset>
      <legend class="label">Scopes</legend>
      {#each API_SCOPES as s (s)}
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="scopes" value={s} checked={s === 'products:read'} /> {s}</label>
      {/each}
    </fieldset>
    <div><label class="label" for="rl">Rate limit / นาที</label><input class="input" id="rl" name="rateLimitPerMin" type="number" min="1" max="10000" value="120" /></div>
    <div><label class="label" for="exp">หมดอายุ (ไม่บังคับ)</label><input class="input" id="exp" name="expiresAt" type="datetime-local" /></div>
    <button class="btn-primary w-full">สร้าง</button>
  </form>
</div>
