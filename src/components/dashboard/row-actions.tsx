'use client';

import { useState, useTransition } from 'react';
import { EllipsisVertical } from 'lucide-react';
import { syncTrackedUrlAction } from '@/app/actions/check-prices';
import { deleteTrackedUrlAction, setTrackedUrlActiveAction } from '@/app/actions/tracked-urls';
import type { ActionResult } from '@/app/actions/types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { TrackedUrl } from '@/lib/types';
import { EditUrlForm } from './edit-url-form';

export function RowActions({ tracked }: { tracked: TrackedUrl }) {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    // Cambia en cada apertura para remontar el form con los valores actuales
    const [editKey, setEditKey] = useState(0);
    const canRefresh = tracked.status === 'ok';

    function run(action: () => Promise<ActionResult<unknown>>, failure: string) {
        setError(null);
        startTransition(async () => {
            const result = await action().catch(() => null);
            if (!result?.ok) setError(result?.error ?? failure);
        });
    }

    const refresh = () => run(() => syncTrackedUrlAction(tracked.id), 'No se pudo actualizar el precio');

    const toggle = () =>
        run(() => setTrackedUrlActiveAction(tracked.id, !tracked.active), tracked.active ? 'No se pudo pausar' : 'No se pudo reactivar');

    const remove = () => {
        if (!confirm('¿Eliminar esta URL y todo su historial?')) return;
        run(() => deleteTrackedUrlAction(tracked.id), 'No se pudo eliminar');
    };

    const openEdit = () => {
        setEditKey((key) => key + 1);
        setEditOpen(true);
    };

    return (
        // Los eventos de React burbujean a través de los portals del dropdown y el dialog:
        // sin esto, cualquier click aquí abre/cierra el accordion de la tarjeta.
        <div
            className="flex flex-col items-end gap-1"
            onClick={(event) => event.stopPropagation()}
        >
            <div className="flex gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            disabled={pending}
                        >
                            <EllipsisVertical className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-40"
                        align="start"
                    >
                        <DropdownMenuGroup>
                            <DropdownMenuItem onSelect={openEdit}>Editar</DropdownMenuItem>
                            {canRefresh && <DropdownMenuItem onClick={refresh}>Sincronizar</DropdownMenuItem>}
                            <DropdownMenuItem onClick={toggle}>{tracked.active ? 'Pausar' : 'Reactivar'}</DropdownMenuItem>
                            <DropdownMenuItem onClick={remove}>Eliminar</DropdownMenuItem>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {error && (
                <p
                    role="alert"
                    className="text-sm text-destructive"
                >
                    {error}
                </p>
            )}
            {/* Fuera de DropdownMenuContent: evita que Radix deje pointer-events/foco bloqueados */}
            <EditUrlForm
                key={editKey}
                tracked={tracked}
                open={editOpen}
                onOpenChange={setEditOpen}
            />
        </div>
    );
}
