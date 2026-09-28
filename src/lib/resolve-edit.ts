import type { ResolvedUrl } from './resolve-url';
import type { BrowseEntry, Params, TrackedUrl, TrackedUrlStatus } from './types';

export interface EditInput {
    label: string;
    url: string; // ya normalizada con parseSolotodoUrl
    categoryId: number | null;
    params: Params;
}

export interface EditDeps {
    resolveUrl(url: string): Promise<ResolvedUrl>;
    browse(categoryId: number, params: Params): Promise<BrowseEntry[]>;
}

export type EditResult = Pick<TrackedUrl, 'label' | 'url' | 'categoryId' | 'params' | 'status'>;

export function sameParams(a: Params, b: Params): boolean {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key, i) => key === keysB[i] && a[key].length === b[key].length && a[key].every((value, j) => value === b[key][j]));
}

async function probeStatus(categoryId: number | null, params: Params, deps: EditDeps): Promise<TrackedUrlStatus> {
    if (categoryId === null) return 'needs_review';
    try {
        return (await deps.browse(categoryId, params)).length > 0 ? 'ok' : 'needs_review';
    } catch {
        return 'needs_review';
    }
}

export async function resolveEdit(current: TrackedUrl, input: EditInput, deps: EditDeps): Promise<EditResult> {
    const filtersChanged = input.categoryId !== current.categoryId || !sameParams(input.params, current.params);
    if (filtersChanged) {
        return { ...input, status: await probeStatus(input.categoryId, input.params, deps) };
    }
    if (input.url === current.url) {
        return { ...input, status: current.status };
    }
    // URL nueva con los filtros de la anterior: se vuelven a detectar, como al crear
    const resolved = await deps.resolveUrl(input.url);
    return { label: input.label, url: resolved.url, categoryId: resolved.categoryId, params: resolved.params, status: resolved.status };
}
