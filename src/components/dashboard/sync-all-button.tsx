'use client';

import { useTransition } from 'react';
import { RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { syncAllAction } from '@/app/actions/check-prices';
import { Button } from '@/components/ui/button';

export function SyncAllButton() {
    const [pending, startTransition] = useTransition();

    function syncAll() {
        startTransition(async () => {
            const promise = syncAllAction().then((result) => (result.ok ? result.data : Promise.reject(new Error(result.error))));
            toast.promise(promise, {
                loading: 'Sincronizando precios…',
                success: (data) => `Sincronizado: ${data.checked} OK${data.failed > 0 ? `, ${data.failed} fallidos` : ''}`,
                error: (error) => (error instanceof Error ? error.message : 'Error al sincronizar precios'),
            });
            // toast.promise muestra el error; aquí solo esperamos para mantener el pending
            await promise.catch(() => undefined);
        });
    }

    return (
        <Button
            type="button"
            variant="outline"
            onClick={syncAll}
            disabled={pending}
        >
            <RefreshCcw className={pending ? 'animate-spin' : 'size-3'} />
            Sincronizar todo
        </Button>
    );
}
