<script lang="ts">
  import { enhance } from '$app/forms';
  import { USER_ROLES, roleAtLeast } from '@affiliate/shared';
  import Badge from '$lib/components/Badge.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import { formatDate } from '$lib/format';

  let { data, form } = $props();
  let isAdmin = $derived(data.user ? roleAtLeast(data.user.role, 'ADMIN') : false);
  let s = $derived(data.settings);
</script>

<svelte:head><title>ตั้งค่าระบบ · Affiliate Admin</title></svelte:head>

<h1 class="mb-4 text-xl font-semibold">ตั้งค่าระบบ</h1>
<FormMessage {form} />

<div class="grid gap-4 lg:grid-cols-2">
  <form method="POST" action="?/settings" class="card space-y-3" use:enhance>
    <h2 class="font-medium">การซิงค์อัตโนมัติ</h2>
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="syncEnabled" checked={s.syncEnabled} disabled={!isAdmin} /> เปิดการซิงค์ตามตารางเวลา</label>
    <div>
      <label class="label" for="cron">Cron (Asia/Bangkok)</label>
      <input class="input font-mono" id="cron" name="syncCron" value={s.syncCron} disabled={!isAdmin} required />
      <p class="mt-1 text-xs text-slate-500">เช่น <code>0 */6 * * *</code> = ทุก 6 ชั่วโมง</p>
    </div>
    <div>
      <label class="label" for="kw">คีย์เวิร์ดเริ่มต้น (คั่นด้วย ,)</label>
      <input class="input" id="kw" name="defaultSyncKeywords" value={s.defaultSyncKeywords.join(', ')} disabled={!isAdmin} />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div><label class="label" for="ph">เก็บประวัติราคา (วัน)</label><input class="input" id="ph" name="priceHistoryRetentionDays" type="number" min="7" max="3650" value={s.priceHistoryRetentionDays} disabled={!isAdmin} /></div>
      <div><label class="label" for="cr">เก็บข้อมูลคลิก (วัน)</label><input class="input" id="cr" name="clickRetentionDays" type="number" min="7" max="3650" value={s.clickRetentionDays} disabled={!isAdmin} /></div>
    </div>
    {#if isAdmin}<button class="btn-primary">บันทึก</button>{/if}
  </form>

  {#if data.users}
    <section class="card space-y-3">
      <h2 class="font-medium">ผู้ใช้ระบบ</h2>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead><tr><th>ผู้ใช้</th><th>Role</th><th>เข้าใช้ล่าสุด</th><th></th></tr></thead>
          <tbody>
            {#each data.users as u (u.id)}
              <tr>
                <td>{u.name}<br /><span class="text-xs text-slate-500">{u.email}</span></td>
                <td><Badge value={u.role} /></td>
                <td class="text-xs text-slate-500">{formatDate(u.lastLoginAt)}</td>
                <td>
                  {#if u.id !== data.user?.id}
                    <form method="POST" action="?/toggleUser" use:enhance>
                      <input type="hidden" name="id" value={u.id} /><input type="hidden" name="isActive" value={String(!u.isActive)} />
                      <button class="btn-secondary">{u.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
                    </form>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <form method="POST" action="?/createUser" class="grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2" use:enhance autocomplete="off">
        <input class="input" name="name" placeholder="ชื่อ" required />
        <input class="input" name="email" type="email" placeholder="อีเมล" required />
        <input class="input" name="password" type="password" placeholder="รหัสผ่าน (≥12 ตัว)" minlength="12" required autocomplete="new-password" />
        <select class="input" name="role">{#each USER_ROLES as r (r)}<option selected={r === 'VIEWER'}>{r}</option>{/each}</select>
        <button class="btn-primary sm:col-span-2">เพิ่มผู้ใช้</button>
      </form>
    </section>
  {/if}
</div>

{#if data.audit}
  <section class="card mt-4 overflow-x-auto">
    <h2 class="mb-2 font-medium">Audit log (การเปลี่ยนแปลงล่าสุด)</h2>
    <table class="data-table">
      <thead><tr><th>เวลา</th><th>ผู้กระทำ</th><th>Action</th><th>Request</th><th>Status</th></tr></thead>
      <tbody>
        {#each data.audit.data as l (l.id)}
          <tr>
            <td class="text-xs whitespace-nowrap text-slate-500">{formatDate(l.createdAt)}</td>
            <td class="text-xs">{l.userEmail ?? (l.apiKeyPrefix ? `key ${l.apiKeyPrefix}` : '—')}</td>
            <td><code class="text-xs">{l.action}</code></td>
            <td class="text-xs">{l.method} {l.path}</td>
            <td>{l.status}</td>
          </tr>
        {:else}<tr><td colspan="5" class="text-slate-500">ยังไม่มีข้อมูล</td></tr>{/each}
      </tbody>
    </table>
  </section>
{/if}
