<script lang="ts">
  import { enhance } from '$app/forms';
  import FormMessage from '$lib/components/FormMessage.svelte';

  let { form } = $props();
  let submitting = $state(false);
</script>

<svelte:head><title>เข้าสู่ระบบ · Affiliate Admin</title></svelte:head>

<div class="flex min-h-screen items-center justify-center px-4">
  <form
    method="POST"
    class="card w-full max-w-sm space-y-4"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        await update();
        submitting = false;
      };
    }}
  >
    <div>
      <h1 class="text-lg font-semibold">Affiliate Data Service</h1>
      <p class="text-sm text-slate-500">เข้าสู่ระบบผู้ดูแล</p>
    </div>
    <FormMessage {form} />
    <div>
      <label class="label" for="email">อีเมล</label>
      <input class="input" id="email" name="email" type="email" autocomplete="username" required value={form?.email ?? ''} />
    </div>
    <div>
      <label class="label" for="password">รหัสผ่าน</label>
      <input class="input" id="password" name="password" type="password" autocomplete="current-password" required minlength="8" />
    </div>
    <button class="btn-primary w-full" disabled={submitting}>{submitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
  </form>
</div>
