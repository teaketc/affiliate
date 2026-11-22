<script lang="ts">
  let { form }: { form: { message?: string; errors?: Record<string, string>; success?: string } | null | undefined } = $props();
</script>

{#if form?.message}
  <div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
    {form.message}
    {#if form.errors}
      <ul class="mt-1 list-inside list-disc">
        {#each Object.entries(form.errors) as [field, msg] (field)}
          <li><code>{field}</code>: {msg}</li>
        {/each}
      </ul>
    {/if}
  </div>
{:else if form?.success}
  <div class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
    {form.success}
  </div>
{/if}
