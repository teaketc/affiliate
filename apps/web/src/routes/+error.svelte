<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="card mx-auto mt-10 max-w-lg text-center">
  <p class="text-4xl font-bold text-slate-300">{page.status}</p>
  <p class="mt-2 text-slate-700">{page.error?.message ?? 'เกิดข้อผิดพลาด'}</p>
  {#if page.error?.code}<p class="mt-1 text-xs text-slate-400">{page.error.code}</p>{/if}
  <a href="/" class="btn-secondary mt-4">กลับหน้าแรก</a>
</div>
