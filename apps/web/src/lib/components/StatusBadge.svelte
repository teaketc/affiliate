<script lang="ts">
	import type { ExtractionStatus } from '@affiliate/shared';
	let { status }: { status: ExtractionStatus } = $props();
	const styles: Record<ExtractionStatus, string> = {
		SUCCESS: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
		PARTIAL: 'bg-amber-50 text-amber-700 ring-amber-200',
		FAILED: 'bg-rose-50 text-rose-700 ring-rose-200'
	};
</script>

<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 {styles[status]}">{status}</span>
