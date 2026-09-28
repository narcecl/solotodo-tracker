import type { FormState } from '@/app/actions/types';

export const IDLE_STATE: FormState = { kind: 'idle' };
export const CONNECTION_ERROR: FormState = { kind: 'error', text: 'No se pudo conectar con el servidor.' };

const MESSAGE_CLASS: Record<Exclude<FormState['kind'], 'idle'>, string> = {
    ok: 'text-green-700 dark:text-green-400',
    warn: 'text-amber-700 dark:text-amber-400',
    error: 'text-destructive',
};

export function FormMessage({ state }: { state: FormState }) {
    if (state.kind === 'idle') return null;
    return (
        <p
            role={state.kind === 'error' ? 'alert' : 'status'}
            className={`text-sm ${MESSAGE_CLASS[state.kind]}`}
        >
            {state.text}
        </p>
    );
}
