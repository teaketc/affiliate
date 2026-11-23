export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
	id: number;
	kind: ToastKind;
	title: string;
	message?: string;
}

let nextId = 1;
export const toasts = $state<Toast[]>([]);

export function dismiss(id: number): void {
	const i = toasts.findIndex((t) => t.id === id);
	if (i >= 0) toasts.splice(i, 1);
}

export function notify(kind: ToastKind, title: string, message?: string, timeoutMs = 5000): void {
	const id = nextId++;
	toasts.push({ id, kind, title, message });
	if (timeoutMs > 0) setTimeout(() => dismiss(id), timeoutMs);
}

/** Signals other views (e.g. product list) that data changed and should be refetched. */
export const dataVersion = $state({ value: 0 });
export function bumpDataVersion(): void {
	dataVersion.value++;
}
