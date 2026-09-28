'use client';

import { SubmitEvent, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { updateTrackedUrlAction } from '@/app/actions/tracked-urls';
import type { FormState } from '@/app/actions/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { TrackedUrl } from '@/lib/types';
import { LABEL_MAX } from '@/lib/validation';
import { CONNECTION_ERROR, FormMessage, IDLE_STATE } from './form-message';

interface Props {
    tracked: TrackedUrl;
    open: boolean;
    onOpenChange(open: boolean): void;
}

export function EditUrlForm({ tracked, open, onOpenChange }: Props) {
    const [pending, startTransition] = useTransition();
    const [state, setState] = useState<FormState>(IDLE_STATE);
    const invalid = (field: string) => state.kind === 'error' && state.field === field;

    function onSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setState(IDLE_STATE);

        startTransition(async () => {
            const result = await updateTrackedUrlAction(data).catch(() => CONNECTION_ERROR);
            if (result.kind === 'ok') {
                toast.success(result.text);
                onOpenChange(false);
                return;
            }
            // warn y error: el dialog queda abierto con lo que el usuario escribió
            setState(result);
        });
    }

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar URL</DialogTitle>
                    <DialogDescription>Si cambias la URL sin tocar categoría ni parámetros, se vuelven a detectar automáticamente.</DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit}>
                    <input
                        type="hidden"
                        name="id"
                        defaultValue={tracked.id}
                    />
                    <div className="flex flex-col gap-4">
                        <label className="space-y-1 text-sm">
                            <span>Nombre</span>
                            <Input
                                name="label"
                                type="text"
                                required
                                maxLength={LABEL_MAX}
                                defaultValue={tracked.label}
                                aria-invalid={invalid('label')}
                            />
                        </label>
                        <label className="space-y-1 text-sm">
                            <span>URL del listado en SoloTodo</span>
                            <Input
                                name="url"
                                type="url"
                                required
                                defaultValue={tracked.url}
                                aria-invalid={invalid('url')}
                            />
                        </label>
                        <label className="space-y-1 text-sm">
                            <span>Categoría SoloTodo</span>
                            <Input
                                name="categoryId"
                                type="number"
                                min={1}
                                step={1}
                                defaultValue={tracked.categoryId ?? ''}
                                aria-invalid={invalid('categoryId')}
                            />
                            <span className="block text-xs text-muted-foreground">ID de categoría en SoloTodo (útil para corregir URLs en revisión)</span>
                        </label>
                        <label className="space-y-1 text-sm">
                            <span>Parámetros</span>
                            <Textarea
                                name="params"
                                rows={5}
                                className="font-mono text-xs"
                                defaultValue={JSON.stringify(tracked.params, null, 2)}
                                aria-invalid={invalid('params')}
                            />
                            <span className="block text-xs text-muted-foreground">Filtros de la URL en formato JSON</span>
                        </label>
                        <div className="flex items-center gap-3">
                            <Button
                                type="submit"
                                disabled={pending}
                            >
                                {pending ? 'Guardando…' : 'Guardar cambios'}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancelar
                            </Button>
                            <FormMessage state={state} />
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
