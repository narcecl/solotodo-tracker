'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';

export function SyncAllButton() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    async function syncAll() {
        setLoading(true);
        const promise = fetch('/api/check-prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });

        toast.promise(promise, {
            loading: 'Sincronizando precios…',
            success: async (response) => {
                const data = (await response.json()) as { checked: number; failed: number; alerts: number };
                router.refresh();
                return `Sincronizado: ${data.checked} OK${data.failed > 0 ? `, ${data.failed} fallidos` : ''}`;
            },
            error: 'Error al sincronizar precios',
        });

        // toast.promise actualiza el estado visual; mantenemos loading mientras fetch resuelve
        try {
            await promise;
        } finally {
            setLoading(false);
        }
    }

    return (
        <Button
            type="button"
            variant="outline"
            onClick={syncAll}
            disabled={loading}
        >
            {loading ? <RefreshCcw className="animate-spin" /> : <RefreshCcw className="size-3" />}
            Sincronizar todo
        </Button>
    );
}
