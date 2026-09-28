'use client';

import { SubmitEvent, useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { createTrackedUrlAction } from '@/app/actions/tracked-urls';
import type { FormState } from '@/app/actions/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CONNECTION_ERROR, FormMessage, IDLE_STATE } from './form-message';

export function AddUrlForm() {
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const [state, setState] = useState<FormState>(IDLE_STATE);
    const invalid = (field: string) => state.kind === 'error' && state.field === field;

    function onSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setState(IDLE_STATE);

        startTransition(async () => {
            const result = await createTrackedUrlAction(data).catch(() => CONNECTION_ERROR);
            // Solo se limpia si se guardó: con error el usuario conserva lo que escribió
            if (result.kind !== 'error') form.reset();
            setState(result);
        });
    }

    return (
        <>
            <Button onClick={() => setOpen(true)}>
                <Plus />
                Agregar URL
            </Button>
            <Dialog
                open={open}
                onOpenChange={setOpen}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Agregar URL</DialogTitle>
                        <DialogDescription>Ingresa la URL del listado de SoloTodo que deseas seguir y un nombre descriptivo.</DialogDescription>
                    </DialogHeader>

                    <form onSubmit={onSubmit}>
                        <div className="flex flex-col gap-4">
                            <label className="space-y-1 text-sm">
                                <span>URL del listado en SoloTodo</span>
                                <Input
                                    name="url"
                                    type="url"
                                    required
                                    aria-invalid={invalid('url')}
                                    placeholder="https://www.solotodo.cl/ssd-m2-pcie-nvme?..."
                                />
                            </label>
                            <label className="space-y-1 text-sm">
                                <span>Nombre</span>
                                <Input
                                    name="label"
                                    type="text"
                                    required
                                    maxLength={100}
                                    aria-invalid={invalid('label')}
                                    placeholder="SSD 2TB NVMe"
                                />
                            </label>
                            <div className="flex items-center gap-3">
                                <Button
                                    type="submit"
                                    disabled={pending}
                                >
                                    {pending ? 'Agregando…' : 'Agregar'}
                                </Button>
                                <FormMessage state={state} />
                            </div>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
