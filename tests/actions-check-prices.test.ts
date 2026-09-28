import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('@/lib/deps', () => ({ createCheckDeps: vi.fn(() => ({ fake: true })) }));
vi.mock('@/lib/check-prices', () => ({ checkPrices: vi.fn() }));

import { refresh } from 'next/cache';
import { syncAllAction, syncTrackedUrlAction } from '@/app/actions/check-prices';
import { checkPrices } from '@/lib/check-prices';

const SUMMARY = { checked: 1, failed: 0, alerts: 0 };

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkPrices).mockResolvedValue(SUMMARY);
});

describe('syncTrackedUrlAction', () => {
    it.each([0, -1, 1.5, '1abc'])('rechaza id inválido %j', async (id) => {
        expect(await syncTrackedUrlAction(id as number)).toEqual({ ok: false, error: 'No encontrada' });
        expect(checkPrices).not.toHaveBeenCalled();
    });

    it('ejecuta con source manual para esa URL y refresca', async () => {
        expect(await syncTrackedUrlAction(7)).toEqual({ ok: true, data: SUMMARY });
        expect(checkPrices).toHaveBeenCalledWith({ fake: true }, { source: 'manual', trackedUrlId: 7 });
        expect(refresh).toHaveBeenCalledOnce();
    });

    it('error si no se pudo chequear', async () => {
        vi.mocked(checkPrices).mockResolvedValue({ checked: 0, failed: 1, alerts: 0 });
        expect(await syncTrackedUrlAction(7)).toEqual({ ok: false, error: 'No se pudo actualizar ningún precio' });
        expect(refresh).not.toHaveBeenCalled();
    });
});

describe('syncAllAction', () => {
    it('ejecuta sin trackedUrlId', async () => {
        expect(await syncAllAction()).toEqual({ ok: true, data: SUMMARY });
        expect(checkPrices).toHaveBeenCalledWith({ fake: true }, { source: 'manual', trackedUrlId: undefined });
    });

    it('error si no hay nada chequeable', async () => {
        vi.mocked(checkPrices).mockResolvedValue({ checked: 0, failed: 0, alerts: 0 });
        expect((await syncAllAction()).ok).toBe(false);
    });
});
