import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type EditDeps, type EditInput, resolveEdit, sameParams } from '@/lib/resolve-edit';
import type { BrowseEntry, TrackedUrl } from '@/lib/types';

const CURRENT: TrackedUrl = {
    id: 1,
    url: 'https://www.solotodo.cl/ssd-m2-pcie-nvme',
    label: 'SSD 2TB',
    categoryId: 39,
    params: { bus: ['1'], size: ['2000', '4000'] },
    status: 'needs_review',
    active: true,
    createdAt: new Date('2026-09-28T00:00:00Z'),
};

const ENTRY: BrowseEntry = { productId: 1, name: 'X', slug: 'x', normalPrice: 1, offerPrice: 1 };

const input = (overrides: Partial<EditInput> = {}): EditInput => ({
    label: CURRENT.label,
    url: CURRENT.url,
    categoryId: CURRENT.categoryId,
    params: CURRENT.params,
    ...overrides,
});

let deps: { resolveUrl: ReturnType<typeof vi.fn>; browse: ReturnType<typeof vi.fn> };

beforeEach(() => {
    deps = { resolveUrl: vi.fn(), browse: vi.fn() };
});

const run = (i: EditInput) => resolveEdit(CURRENT, i, deps as unknown as EditDeps);

describe('sameParams', () => {
    it('ignora el orden de las claves', () => {
        expect(sameParams({ a: ['1'], b: ['2'] }, { b: ['2'], a: ['1'] })).toBe(true);
    });

    it('detecta valores, claves o largo distintos', () => {
        expect(sameParams({ a: ['1'] }, { a: ['2'] })).toBe(false);
        expect(sameParams({ a: ['1'] }, { b: ['1'] })).toBe(false);
        expect(sameParams({ a: ['1'] }, { a: ['1', '2'] })).toBe(false);
        expect(sameParams({ a: ['1'] }, {})).toBe(false);
    });
});

describe('resolveEdit', () => {
    it('solo cambia label: no consulta SoloTodo y mantiene el status', async () => {
        const result = await run(input({ label: 'Nuevo' }));
        expect(result).toEqual({ label: 'Nuevo', url: CURRENT.url, categoryId: 39, params: CURRENT.params, status: 'needs_review' });
        expect(deps.browse).not.toHaveBeenCalled();
        expect(deps.resolveUrl).not.toHaveBeenCalled();
    });

    it('params con otro orden de claves no cuenta como cambio', async () => {
        await run(input({ params: { size: ['2000', '4000'], bus: ['1'] } }));
        expect(deps.browse).not.toHaveBeenCalled();
        expect(deps.resolveUrl).not.toHaveBeenCalled();
    });

    it('cambia url sin tocar filtros: re-resuelve con resolveUrl', async () => {
        const url = 'https://www.solotodo.cl/notebooks';
        deps.resolveUrl.mockResolvedValue({ url, categoryId: 1, params: { ram: ['16'] }, status: 'ok' });
        const result = await run(input({ url, label: 'Notebooks' }));
        expect(deps.resolveUrl).toHaveBeenCalledWith(url);
        expect(deps.browse).not.toHaveBeenCalled();
        expect(result).toEqual({ label: 'Notebooks', url, categoryId: 1, params: { ram: ['16'] }, status: 'ok' });
    });

    it('filtros editados con resultados en browse: ok', async () => {
        deps.browse.mockResolvedValue([ENTRY]);
        const result = await run(input({ categoryId: 3, params: {} }));
        expect(deps.browse).toHaveBeenCalledWith(3, {});
        expect(deps.resolveUrl).not.toHaveBeenCalled();
        expect(result).toMatchObject({ categoryId: 3, params: {}, status: 'ok' });
    });

    it('filtros editados sin resultados: needs_review', async () => {
        deps.browse.mockResolvedValue([]);
        expect((await run(input({ params: { bus: ['9'] } }))).status).toBe('needs_review');
    });

    it('filtros editados y browse lanza: needs_review', async () => {
        deps.browse.mockRejectedValue(new Error('500'));
        expect((await run(input({ categoryId: 3 }))).status).toBe('needs_review');
    });

    it('categoryId null: needs_review sin llamar a browse', async () => {
        const result = await run(input({ categoryId: null }));
        expect(result.status).toBe('needs_review');
        expect(deps.browse).not.toHaveBeenCalled();
    });

    it('cambia url y filtros a la vez: respeta los filtros manuales', async () => {
        deps.browse.mockResolvedValue([ENTRY]);
        const url = 'https://www.solotodo.cl/procesadores';
        const result = await run(input({ url, categoryId: 3, params: {} }));
        expect(deps.resolveUrl).not.toHaveBeenCalled();
        expect(result).toMatchObject({ url, categoryId: 3, params: {}, status: 'ok' });
    });
});
