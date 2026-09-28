'use server';

import { refresh } from 'next/cache';
import { createTrackedUrl, deleteTrackedUrl, priceRepo, setTrackedUrlActive, updateTrackedUrl } from '@/lib/db/repo';
import { resolveEdit } from '@/lib/resolve-edit';
import { InvalidUrlError, type ResolveDeps, fetchPageHtml, parseSolotodoUrl, resolveUrl } from '@/lib/resolve-url';
import { createSolotodoClient } from '@/lib/solotodo';
import { ValidationError, parseCategoryId, parseId, parseLabel, parseParams } from '@/lib/validation';
import type { ActionResult, FormState } from './types';

const NOT_FOUND = 'No encontrada';
const notFound = { ok: false, error: NOT_FOUND } as const;

function resolveDeps(): ResolveDeps {
    const client = createSolotodoClient();
    return {
        fetchHtml: (pageUrl) => fetchPageHtml(pageUrl),
        browse: (categoryId, params) => client.browse(categoryId, params),
    };
}

function toErrorState(error: unknown): FormState {
    if (error instanceof ValidationError) return { kind: 'error', text: error.message, field: error.field };
    if (error instanceof InvalidUrlError) return { kind: 'error', text: error.message, field: 'url' };
    throw error;
}

export async function createTrackedUrlAction(formData: FormData): Promise<FormState> {
    try {
        const label = parseLabel(formData.get('label'));
        const resolved = await resolveUrl(String(formData.get('url') ?? ''), resolveDeps());
        const created = await createTrackedUrl({ ...resolved, label });
        refresh();
        return created.status === 'ok'
            ? { kind: 'ok', text: 'URL agregada. Usa "Sincronizar" para ver su precio.' }
            : { kind: 'warn', text: 'URL guardada, pero no se pudo resolver: quedó en revisión.' };
    } catch (error) {
        return toErrorState(error);
    }
}

export async function updateTrackedUrlAction(formData: FormData): Promise<FormState> {
    const id = parseId(formData.get('id'));
    const current = id === null ? null : await priceRepo.getTrackedUrl(id);
    if (!current) return { kind: 'error', text: NOT_FOUND };

    try {
        const input = {
            label: parseLabel(formData.get('label')),
            url: parseSolotodoUrl(String(formData.get('url') ?? '')).toString(),
            categoryId: parseCategoryId(formData.get('categoryId')),
            params: parseParams(formData.get('params')),
        };
        const deps = resolveDeps();
        const next = await resolveEdit(current, input, {
            resolveUrl: (url) => resolveUrl(url, deps),
            browse: deps.browse,
        });
        const updated = await updateTrackedUrl(current.id, next);
        if (!updated) return { kind: 'error', text: NOT_FOUND };
        refresh();
        return updated.status === 'ok'
            ? { kind: 'ok', text: 'Cambios guardados.' }
            : { kind: 'warn', text: 'Cambios guardados, pero la URL sigue sin resolver: revisa categoría y parámetros.' };
    } catch (error) {
        return toErrorState(error);
    }
}

export async function setTrackedUrlActiveAction(id: number, active: boolean): Promise<ActionResult> {
    if (typeof active !== 'boolean') return { ok: false, error: 'active debe ser true o false' };
    const parsed = parseId(id);
    if (parsed === null) return notFound;
    if (!(await setTrackedUrlActive(parsed, active))) return notFound;
    refresh();
    return { ok: true, data: undefined };
}

export async function deleteTrackedUrlAction(id: number): Promise<ActionResult> {
    const parsed = parseId(id);
    if (parsed === null) return notFound;
    if (!(await deleteTrackedUrl(parsed))) return notFound;
    refresh();
    return { ok: true, data: undefined };
}
