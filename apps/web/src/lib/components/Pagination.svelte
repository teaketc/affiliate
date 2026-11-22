<script lang="ts">
  import { page as pageState } from '$app/state';
  import type { PageMeta } from '@affiliate/shared';
  import { withParams } from '$lib/format';

  let { meta }: { meta: PageMeta } = $props();
</script>

{#if meta.totalPages > 1}
  <nav class="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
    <span class="text-slate-500">หน้า {meta.page} / {meta.totalPages} · ทั้งหมด {meta.total}</span>
    <div class="flex gap-2">
      {#if meta.page > 1}
        <a class="btn-secondary" href={withParams(pageState.url, { page: meta.page - 1 })}>ก่อนหน้า</a>
      {/if}
      {#if meta.page < meta.totalPages}
        <a class="btn-secondary" href={withParams(pageState.url, { page: meta.page + 1 })}>ถัดไป</a>
      {/if}
    </div>
  </nav>
{:else}
  <p class="mt-4 text-sm text-slate-500">ทั้งหมด {meta.total} รายการ</p>
{/if}
