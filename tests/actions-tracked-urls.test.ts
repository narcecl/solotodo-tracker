import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackedUrl } from '@/lib/types';

vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('@/lib/db/repo', () => ({
    createTrackedUrl: vi.fn(),
    setTrackedUrlActive: vi.fn(),
    deleteTrackedUrl: vi.fn(),
    updateTrackedUrl: vi.fn(),
    priceRepo: { getTrackedUrl: vi.fn() },
}));
vi.mock('@/lib/resolve-url', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/resolve-url')>()),
    resolveUrl: vi.fn(),
}));
vi.mock('@/lib/resolve-edit', () => ({ resolveEdit: vi.fn() }));

import { refresh } from 'next/cache';
import {
    createTrackedUrlAction,
    deleteTrackedUrlAction,
    setTrackedUrlActiveAction,
    updateTrackedUrlAction,
} from '@/app/actions/tracked-urls';
import { createTrackedUrl, deleteTrackedUrl, priceRepo, setTrackedUrlActive, updateTrackedUrl } from '@/lib/db/repo';
import { resolveEdit } from '@/lib/resolve-edit';
import { InvalidUrlError, resolveUrl } from '@/lib/resolve-url';

const ROW: TrackedUrl = {
    id: 1,
    url: 'https://www.solotodo.cl/ssd-m2-pcie-nvme',
    label: 'SSD 2TB',
    categoryId: 39,
    params: {},
    status: 'ok',
    active: true,
    createdAt: new Date('2026-09-28T00:00:00Z'),
};

const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
};

const editForm = (overrides: Record<string, string> = {}) =>
    form({ id: '1', label: ROW.label, url: ROW.url, categoryId: '39', params: '{}', ...overrides });

beforeEach(() => {
    vi.clearAllMocks();
});

describe('createTrackedUrlAction', () => {
    it('error si el nombre está vacío, sin resolver la URL', async () => {
        const state = await createTrackedUrlAction(form({ url: ROW.url, label: '   ' }));
        expect(state).toEqual({ kind: 'error', text: 'El nombre es obligatorio', field: 'label' });
        expect(resolveUrl).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
    });

    it('error con el mensaje de InvalidUrlError', async () => {
        vi.mocked(resolveUrl).mockRejectedValue(new InvalidUrlError('La URL debe ser de solotodo.cl'));
        const state = await createTrackedUrlAction(form({ url: 'https://evil.com', label: 'X' }));
        expect(state).toEqual({ kind: 'error', text: 'La URL debe ser de solotodo.cl', field: 'url' });
    });

    it('guarda la URL resuelta con el label recortado y avisa si quedó en revisión', async () => {
        vi.mocked(resolveUrl).mockResolvedValue({ url: ROW.url, categoryId: 39, params: { bus: ['1'] }, status: 'needs_review' });
        vi.mocked(createTrackedUrl).mockResolvedValue({ ...ROW, status: 'needs_review' });
        const state = await createTrackedUrlAction(form({ url: ROW.url, label: '  SSD 2TB ' }));
        expect(createTrackedUrl).toHaveBeenCalledWith({ url: ROW.url, label: 'SSD 2TB', categoryId: 39, params: { bus: ['1'] }, status: 'needs_review' });
        expect(state.kind).toBe('warn');
        expect(refresh).toHaveBeenCalledOnce();
    });

    it('ok si la URL se resolvió', async () => {
        vi.mocked(resolveUrl).mockResolvedValue({ url: ROW.url, categoryId: 39, params: {}, status: 'ok' });
        vi.mocked(createTrackedUrl).mockResolvedValue(ROW);
        expect(await createTrackedUrlAction(form({ url: ROW.url, label: 'SSD' }))).toEqual({
            kind: 'ok',
            text: 'URL agregada. Usa "Sincronizar" para ver su precio.',
        });
    });
});

describe('setTrackedUrlActiveAction', () => {
    it('rechaza active no boolean', async () => {
        expect(await setTrackedUrlActiveAction(1, 'no' as unknown as boolean)).toEqual({ ok: false, error: 'active debe ser true o false' });
        expect(setTrackedUrlActive).not.toHaveBeenCalled();
    });

    it('No encontrada con id inválido o inexistente', async () => {
        expect(await setTrackedUrlActiveAction('abc' as unknown as number, false)).toEqual({ ok: false, error: 'No encontrada' });
        vi.mocked(setTrackedUrlActive).mockResolvedValue(null);
        expect(await setTrackedUrlActiveAction(99, false)).toEqual({ ok: false, error: 'No encontrada' });
        expect(refresh).not.toHaveBeenCalled();
    });

    it('actualiza active y refresca', async () => {
        vi.mocked(setTrackedUrlActive).mockResolvedValue({ ...ROW, active: false });
        expect(await setTrackedUrlActiveAction(1, false)).toEqual({ ok: true, data: undefined });
        expect(setTrackedUrlActive).toHaveBeenCalledWith(1, false);
        expect(refresh).toHaveBeenCalledOnce();
    });
});

describe('deleteTrackedUrlAction', () => {
    it('borra y refresca; No encontrada si no existe', async () => {
        vi.mocked(deleteTrackedUrl).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        expect(await deleteTrackedUrlAction(1)).toEqual({ ok: true, data: undefined });
        expect(await deleteTrackedUrlAction(2)).toEqual({ ok: false, error: 'No encontrada' });
        expect(refresh).toHaveBeenCalledOnce();
    });
});

describe('updateTrackedUrlAction', () => {
    beforeEach(() => {
        vi.mocked(priceRepo.getTrackedUrl).mockResolvedValue(ROW);
    });

    it('No encontrada si el id no existe', async () => {
        vi.mocked(priceRepo.getTrackedUrl).mockResolvedValue(null);
        expect(await updateTrackedUrlAction(editForm({ id: '99' }))).toEqual({ kind: 'error', text: 'No encontrada' });
        expect(await updateTrackedUrlAction(editForm({ id: 'abc' }))).toEqual({ kind: 'error', text: 'No encontrada' });
        expect(updateTrackedUrl).not.toHaveBeenCalled();
    });

    it.each([
        [{ label: '' }, 'label'],
        [{ url: 'https://evil.com/x' }, 'url'],
        [{ url: 'https://www.solotodo.cl/products/123' }, 'url'],
        [{ categoryId: '-3' }, 'categoryId'],
        [{ params: '{"a": 1}' }, 'params'],
    ])('rechaza %j marcando %s', async (overrides, field) => {
        const state = await updateTrackedUrlAction(editForm(overrides));
        expect(state).toMatchObject({ kind: 'error', field });
        expect(resolveEdit).not.toHaveBeenCalled();
        expect(updateTrackedUrl).not.toHaveBeenCalled();
    });

    it('pasa a resolveEdit la URL normalizada y los valores parseados', async () => {
        vi.mocked(resolveEdit).mockResolvedValue({ label: 'Nuevo', url: ROW.url, categoryId: null, params: { bus: ['1'] }, status: 'needs_review' });
        vi.mocked(updateTrackedUrl).mockResolvedValue({ ...ROW, status: 'needs_review' });
        await updateTrackedUrlAction(editForm({ label: ' Nuevo ', url: `  ${ROW.url}  `, categoryId: '', params: '{ "bus": ["1"] }' }));
        expect(resolveEdit).toHaveBeenCalledWith(ROW, { label: 'Nuevo', url: ROW.url, categoryId: null, params: { bus: ['1'] } }, expect.any(Object));
    });

    it('guarda el resultado, refresca y responde ok', async () => {
        const next = { label: 'Nuevo', url: ROW.url, categoryId: 3, params: {}, status: 'ok' as const };
        vi.mocked(resolveEdit).mockResolvedValue(next);
        vi.mocked(updateTrackedUrl).mockResolvedValue({ ...ROW, ...next });
        expect(await updateTrackedUrlAction(editForm())).toEqual({ kind: 'ok', text: 'Cambios guardados.' });
        expect(updateTrackedUrl).toHaveBeenCalledWith(1, next);
        expect(refresh).toHaveBeenCalledOnce();
    });

    it('warn si sigue en revisión', async () => {
        vi.mocked(resolveEdit).mockResolvedValue({ label: 'X', url: ROW.url, categoryId: null, params: {}, status: 'needs_review' });
        vi.mocked(updateTrackedUrl).mockResolvedValue({ ...ROW, status: 'needs_review' });
        expect((await updateTrackedUrlAction(editForm())).kind).toBe('warn');
    });

    it('No encontrada si la fila se borró mientras se editaba', async () => {
        vi.mocked(resolveEdit).mockResolvedValue({ label: 'X', url: ROW.url, categoryId: 39, params: {}, status: 'ok' });
        vi.mocked(updateTrackedUrl).mockResolvedValue(null);
        expect(await updateTrackedUrlAction(editForm())).toEqual({ kind: 'error', text: 'No encontrada' });
        expect(refresh).not.toHaveBeenCalled();
    });
});
