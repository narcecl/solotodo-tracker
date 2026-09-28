import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackedUrl } from '@/lib/types';

vi.mock('@/lib/db/repo', () => ({
    createTrackedUrl: vi.fn(),
    setTrackedUrlActive: vi.fn(),
    deleteTrackedUrl: vi.fn(),
}));
vi.mock('@/lib/resolve-url', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/resolve-url')>()),
    resolveUrl: vi.fn(),
}));

import { POST } from '@/app/api/tracked-urls/route';
import { DELETE, PATCH } from '@/app/api/tracked-urls/[id]/route';
import { createTrackedUrl, deleteTrackedUrl, setTrackedUrlActive } from '@/lib/db/repo';
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

const json = (method: string, body: unknown) => new Request('http://localhost/api/tracked-urls', { method, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    vi.mocked(resolveUrl).mockReset();
    vi.mocked(createTrackedUrl).mockReset();
    vi.mocked(setTrackedUrlActive).mockReset();
    vi.mocked(deleteTrackedUrl).mockReset();
});

describe('POST /api/tracked-urls', () => {
    it('400 si el nombre está vacío', async () => {
        const res = await POST(json('POST', { url: ROW.url, label: '   ' }));
        expect(res.status).toBe(400);
        expect(resolveUrl).not.toHaveBeenCalled();
    });

    it('400 con el mensaje de InvalidUrlError', async () => {
        vi.mocked(resolveUrl).mockRejectedValue(new InvalidUrlError('La URL debe ser de solotodo.cl'));
        const res = await POST(json('POST', { url: 'https://evil.com', label: 'X' }));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'La URL debe ser de solotodo.cl' });
    });

    it('201 guarda la URL resuelta con el label recortado', async () => {
        vi.mocked(resolveUrl).mockResolvedValue({
            url: ROW.url,
            categoryId: 39,
            params: { bus: ['1'] },
            status: 'needs_review',
        });
        vi.mocked(createTrackedUrl).mockResolvedValue({ ...ROW, status: 'needs_review' });
        const res = await POST(json('POST', { url: ROW.url, label: '  SSD 2TB ' }));
        expect(res.status).toBe(201);
        expect(createTrackedUrl).toHaveBeenCalledWith({
            url: ROW.url,
            label: 'SSD 2TB',
            categoryId: 39,
            params: { bus: ['1'] },
            status: 'needs_review',
        });
        expect((await res.json()).status).toBe('needs_review');
    });
});

describe('PATCH /api/tracked-urls/[id]', () => {
    it('400 si active no es boolean', async () => {
        const res = await PATCH(json('PATCH', { active: 'no' }), ctx('1'));
        expect(res.status).toBe(400);
    });

    it('404 con id inválido o inexistente', async () => {
        expect((await PATCH(json('PATCH', { active: false }), ctx('abc'))).status).toBe(404);
        vi.mocked(setTrackedUrlActive).mockResolvedValue(null);
        expect((await PATCH(json('PATCH', { active: false }), ctx('99'))).status).toBe(404);
    });

    it('200 actualiza active', async () => {
        vi.mocked(setTrackedUrlActive).mockResolvedValue({ ...ROW, active: false });
        const res = await PATCH(json('PATCH', { active: false }), ctx('1'));
        expect(res.status).toBe(200);
        expect(setTrackedUrlActive).toHaveBeenCalledWith(1, false);
    });
});

describe('DELETE /api/tracked-urls/[id]', () => {
    it('204 si borra, 404 si no existe', async () => {
        vi.mocked(deleteTrackedUrl).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        expect((await DELETE(json('DELETE', null), ctx('1'))).status).toBe(204);
        expect((await DELETE(json('DELETE', null), ctx('2'))).status).toBe(404);
    });
});
