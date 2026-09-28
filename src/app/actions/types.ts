import type { FormField } from '@/lib/validation';

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type FormState = { kind: 'idle' } | { kind: 'ok' | 'warn'; text: string } | { kind: 'error'; text: string; field?: FormField };
