<script lang="ts">
	import type { PaginationMeta } from '@affiliate/shared';
	let { meta, onchange }: { meta: PaginationMeta; onchange: (page: number) => void } = $props();
	const from = $derived(meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1);
	const to = $derived(Math.min(meta.page * meta.pageSize, meta.total));
</script>

<nav class="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row" aria-label="Pagination">
	<p class="text-slate-500">แสดง <span class="font-medium text-slate-700">{from}–{to}</span> จาก <span class="font-medium text-slate-700">{meta.total}</span></p>
	<div class="flex items-center gap-2">
		<button class="btn-secondary px-3 py-1.5" disabled={meta.page <= 1} onclick={() => onchange(meta.page - 1)}>← ก่อนหน้า</button>
		<span class="text-slate-600">หน้า {meta.page} / {meta.totalPages}</span>
		<button class="btn-secondary px-3 py-1.5" disabled={meta.page >= meta.totalPages} onclick={() => onchange(meta.page + 1)}>ถัดไป →</button>
	</div>
</nav>
