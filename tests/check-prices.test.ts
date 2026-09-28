import { describe, expect, it, vi } from 'vitest';
import { checkPrices, type CheckDeps, type PriceRepo } from '@/lib/check-prices';
import type { SolotodoClient } from '@/lib/solotodo';
import type { BrowseEntry, CheckProduct, PriceCheck, StoreOffer, TrackedUrl } from '@/lib/types';

function tracked(overrides: Partial<TrackedUrl> = {}): TrackedUrl {
    return {
        id: 1,
        url: 'https://www.solotodo.cl/ssd-m2-pcie-nvme',
        label: 'SSD 2TB',
        categoryId: 39,
        params: { base_buses: ['1559281'] },
        status: 'ok',
        active: true,
        createdAt: new Date('2026-09-01T00:00:00Z'),
        ...overrides,
    };
}

function entry(overrides: Partial<BrowseEntry> = {}): BrowseEntry {
    return {
        productId: 127681,
        name: 'A-DATA XPG Gammix S70 BLADE 2 TB',
        slug: 'a-data-xpg-gammix-s70-blade-2-tb',
        normalPrice: 400889,
        offerPrice: 379990,
        ...overrides,
    };
}

function product(overrides: Partial<CheckProduct> = {}): CheckProduct {
    return {
        productId: 127681,
        name: 'A-DATA XPG Gammix S70 BLADE 2 TB',
        slug: 'a-data-xpg-gammix-s70-blade-2-tb',
        normalPrice: 400889,
        offerPrice: 379990,
        position: 0,
        ...overrides,
    };
}

function previousCheck(overrides: Partial<PriceCheck> = {}): PriceCheck {
    return {
        id: 100,
        trackedUrlId: 1,
        checkedAt: new Date('2026-09-27T12:00:00Z'),
        source: 'cron',
        productId: 127681,
        productName: 'A-DATA XPG Gammix S70 BLADE 2 TB',
        productSlug: 'a-data-xpg-gammix-s70-blade-2-tb',
        normalPrice: 420000,
        offerPrice: 399990,
        storeName: 'MyShop',
        storeUrl: 'https://myshop.cl/p',
        ...overrides,
    };
}

function makeRepo(
    urls: TrackedUrl[],
    checks: PriceCheck[],
    productsByCheck: Map<number, CheckProduct[]>,
): PriceRepo & { checks: PriceCheck[]; productsByCheck: Map<number, CheckProduct[]> } {
    let nextId = 1000;
    return {
        checks,
        productsByCheck,
        async listCheckableUrls() {
            return urls.filter((u) => u.active && u.status === 'ok');
        },
        async getTrackedUrl(id) {
            return urls.find((u) => u.id === id) ?? null;
        },
        async getLastCheck(trackedUrlId) {
            return checks.filter((c) => c.trackedUrlId === trackedUrlId).at(-1) ?? null;
        },
        async getCheckProducts(priceCheckId) {
            return productsByCheck.get(priceCheckId) ?? [];
        },
        async insertCheck(check, products) {
            const saved: PriceCheck = { ...check, id: nextId++, checkedAt: new Date() };
            checks.push(saved);
            productsByCheck.set(saved.id, products);
            return saved;
        },
    };
}

interface SetupOptions {
    urls?: TrackedUrl[];
    checks?: PriceCheck[];
    previousProducts?: CheckProduct[];
    entries?: BrowseEntry[];
    offers?: StoreOffer[];
    stores?: Map<number, string>;
}

function setup(options: SetupOptions = {}) {
    const productsByCheck = new Map<number, CheckProduct[]>();
    if (options.previousProducts) productsByCheck.set(100, options.previousProducts);
    const repo = makeRepo(options.urls ?? [tracked()], options.checks ?? [], productsByCheck);
    const solotodo = {
        browse: vi.fn<SolotodoClient['browse']>(async () => options.entries ?? [entry()]),
        getAvailableOffers: vi.fn<SolotodoClient['getAvailableOffers']>(
            async () => options.offers ?? [{ storeId: 5144, url: 'https://myshop.cl/p26990', normalPrice: 400889 }],
        ),
        getStores: vi.fn<SolotodoClient['getStores']>(
            async () =>
                options.stores ??
                new Map([
                    [5144, 'MyShop'],
                    [34, 'PC Express'],
                ]),
        ),
    };
    const sendAlert = vi.fn<CheckDeps['sendAlert']>(async () => {});
    const logError = vi.fn<CheckDeps['logError']>();
    const deps: CheckDeps = { repo, solotodo, sendAlert, logError };
    return { deps, repo, solotodo, sendAlert, logError };
}

describe('checkPrices: comparación y alertas', () => {
    const LISTING_URL = 'https://www.solotodo.cl/ssd-m2-pcie-nvme';

    it('cron + baja de precio: inserta el registro y envía el email con la lista', async () => {
        const { deps, repo, sendAlert } = setup({
            checks: [previousCheck()],
            previousProducts: [product({ normalPrice: 420000 })],
        });

        const summary = await checkPrices(deps, { source: 'cron' });

        expect(summary).toEqual({ checked: 1, failed: 0, alerts: 1 });
        expect(repo.checks.at(-1)).toMatchObject({
            trackedUrlId: 1,
            source: 'cron',
            productId: 127681,
            normalPrice: 400889,
            offerPrice: 379990,
            storeName: 'MyShop',
            storeUrl: 'https://myshop.cl/p26990',
        });
        expect(sendAlert).toHaveBeenCalledWith({
            label: 'SSD 2TB',
            listingUrl: LISTING_URL,
            products: [{ ...product(), previousNormalPrice: 420000, kind: 'down' }],
        });
    });

    it('cron + subida de precio: también envía email', async () => {
        const { deps, sendAlert } = setup({
            checks: [previousCheck()],
            previousProducts: [product({ normalPrice: 390000 })],
        });
        const summary = await checkPrices(deps, { source: 'cron' });
        expect(summary.alerts).toBe(1);
        expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({ products: [{ ...product(), previousNormalPrice: 390000, kind: 'up' }] }));
    });

    it('cron + mismo precio: inserta sin email', async () => {
        const { deps, repo, sendAlert } = setup({ checks: [previousCheck()], previousProducts: [product()] });
        await checkPrices(deps, { source: 'cron' });
        expect(repo.checks).toHaveLength(2);
        expect(sendAlert).not.toHaveBeenCalled();
    });

    it('primer chequeo de una URL: inserta sin email', async () => {
        const { deps, repo, sendAlert } = setup({ checks: [] });
        await checkPrices(deps, { source: 'cron' });
        expect(repo.checks).toHaveLength(1);
        expect(sendAlert).not.toHaveBeenCalled();
    });

    it('chequeo anterior sin productos (previo a la migración): inserta sin email', async () => {
        const { deps, repo, sendAlert } = setup({ checks: [previousCheck({ normalPrice: 420000 })] });
        const summary = await checkPrices(deps, { source: 'cron' });
        expect(summary).toEqual({ checked: 1, failed: 0, alerts: 0 });
        expect(repo.checks).toHaveLength(2);
        expect(sendAlert).not.toHaveBeenCalled();
    });

    it('manual + baja de precio: inserta con source manual y nunca envía email', async () => {
        const { deps, repo, sendAlert } = setup({
            checks: [previousCheck()],
            previousProducts: [product({ normalPrice: 420000 })],
        });
        const summary = await checkPrices(deps, { source: 'manual', trackedUrlId: 1 });
        expect(summary).toEqual({ checked: 1, failed: 0, alerts: 0 });
        expect(repo.checks.at(-1)?.source).toBe('manual');
        expect(sendAlert).not.toHaveBeenCalled();
    });

    it('un refresh manual que ya vio la baja hace que el cron siguiente no envíe email', async () => {
        const { deps, sendAlert } = setup({
            checks: [previousCheck()],
            previousProducts: [product({ normalPrice: 420000 })],
        });
        await checkPrices(deps, { source: 'manual', trackedUrlId: 1 });
        await checkPrices(deps, { source: 'cron' });
        expect(sendAlert).not.toHaveBeenCalled();
    });

    it('avisa aunque cambie un producto que no es el más barato, y lista todos', async () => {
        const wd = { productId: 2, name: 'WD Black 2 TB', slug: 'wd-black', offerPrice: 440000 };
        const { deps, sendAlert } = setup({
            checks: [previousCheck()],
            entries: [entry(), entry({ ...wd, normalPrice: 450000 })],
            previousProducts: [product(), product({ ...wd, normalPrice: 460000, position: 1 })],
        });
        await checkPrices(deps, { source: 'cron' });
        expect(sendAlert).toHaveBeenCalledWith({
            label: 'SSD 2TB',
            listingUrl: LISTING_URL,
            products: [
                { ...product(), previousNormalPrice: 400889, kind: 'same' },
                { ...product({ ...wd, normalPrice: 450000, position: 1 }), previousNormalPrice: 460000, kind: 'down' },
            ],
        });
    });

    it('un producto nuevo más barato no dispara email', async () => {
        const { deps, repo, sendAlert } = setup({
            checks: [previousCheck()],
            entries: [entry({ productId: 999, name: 'Kingston NV3 2 TB', slug: 'kingston-nv3', normalPrice: 300000 }), entry()],
            previousProducts: [product()],
        });
        await checkPrices(deps, { source: 'cron' });
        expect(repo.checks.at(-1)).toMatchObject({ productId: 999, normalPrice: 300000 });
        expect(sendAlert).not.toHaveBeenCalled();
    });

    it('un producto que desaparece no dispara email', async () => {
        const { deps, sendAlert } = setup({
            checks: [previousCheck()],
            entries: [entry()],
            previousProducts: [product(), product({ productId: 2, normalPrice: 500000, position: 1 })],
        });
        await checkPrices(deps, { source: 'cron' });
        expect(sendAlert).not.toHaveBeenCalled();
    });

    it('si hay cambios, la lista no incluye los productos desaparecidos', async () => {
        const { deps, sendAlert } = setup({
            checks: [previousCheck()],
            entries: [entry()],
            previousProducts: [product({ normalPrice: 420000 }), product({ productId: 2, normalPrice: 500000, position: 1 })],
        });
        await checkPrices(deps, { source: 'cron' });
        expect(sendAlert.mock.calls[0][0].products.map((p: CheckProduct) => p.productId)).toEqual([127681]);
    });

    it('elige el menor normal_price aunque la página venga desordenada', async () => {
        const { deps, repo } = setup({
            entries: [
                entry({ productId: 1, normalPrice: 500000 }),
                entry({ productId: 2, normalPrice: 350000 }),
                entry({ productId: 3, normalPrice: 450000 }),
            ],
        });
        await checkPrices(deps, { source: 'cron' });
        expect(repo.checks.at(-1)).toMatchObject({ productId: 2, normalPrice: 350000 });
    });
});

describe('checkPrices: tienda informativa', () => {
    it('elige la oferta disponible más barata y, en empate, la primera', async () => {
        const { deps, repo } = setup({
            offers: [
                { storeId: 34, url: 'https://pcexpress.cl/p', normalPrice: 410000 },
                { storeId: 5144, url: 'https://myshop.cl/p', normalPrice: 400889 },
                { storeId: 34, url: 'https://pcexpress.cl/p2', normalPrice: 400889 },
            ],
        });
        await checkPrices(deps, { source: 'cron' });
        expect(repo.checks.at(-1)).toMatchObject({ storeName: 'MyShop', storeUrl: 'https://myshop.cl/p' });
    });

    it('sin ofertas disponibles: tienda null y registro insertado', async () => {
        const { deps, repo } = setup({ offers: [] });
        const summary = await checkPrices(deps, { source: 'cron' });
        expect(summary.checked).toBe(1);
        expect(repo.checks.at(-1)).toMatchObject({ storeName: null, storeUrl: null });
    });

    it('si falla la consulta de ofertas: tienda null, se loguea, y la alerta se envía igual', async () => {
        const { deps, repo, solotodo, sendAlert, logError } = setup({
            checks: [previousCheck()],
            previousProducts: [product({ normalPrice: 420000 })],
        });
        solotodo.getAvailableOffers.mockRejectedValueOnce(new Error('timeout'));
        const summary = await checkPrices(deps, { source: 'cron' });
        expect(summary).toEqual({ checked: 1, failed: 0, alerts: 1 });
        expect(repo.checks.at(-1)).toMatchObject({ storeName: null, storeUrl: null });
        expect(sendAlert).toHaveBeenCalledTimes(1);
        expect(logError).toHaveBeenCalled();
    });

    it('si falla la lista de tiendas: tienda null y registro insertado', async () => {
        const { deps, repo, solotodo } = setup();
        solotodo.getStores.mockRejectedValueOnce(new Error('500'));
        await checkPrices(deps, { source: 'cron' });
        expect(repo.checks.at(-1)).toMatchObject({ storeName: null, storeUrl: null });
    });

    it('pide la lista de tiendas una sola vez por ejecución', async () => {
        const { deps, solotodo } = setup({ urls: [tracked({ id: 1 }), tracked({ id: 2, label: 'Otro' })] });
        await checkPrices(deps, { source: 'cron' });
        expect(solotodo.getStores).toHaveBeenCalledTimes(1);
    });
});

describe('checkPrices: errores y selección de URLs', () => {
    it('0 resultados: no inserta, cuenta como fallo y loguea', async () => {
        const { deps, repo, logError } = setup({ entries: [] });
        const summary = await checkPrices(deps, { source: 'cron' });
        expect(summary).toEqual({ checked: 0, failed: 1, alerts: 0 });
        expect(repo.checks).toHaveLength(0);
        expect(logError).toHaveBeenCalled();
    });

    it('un fallo en una URL no bloquea las demás', async () => {
        const { deps, repo, solotodo } = setup({
            urls: [tracked({ id: 1, label: 'Rota' }), tracked({ id: 2, label: 'Sana' })],
        });
        solotodo.browse.mockRejectedValueOnce(new Error('500'));
        const summary = await checkPrices(deps, { source: 'cron' });
        expect(summary).toEqual({ checked: 1, failed: 1, alerts: 0 });
        expect(repo.checks.map((c) => c.trackedUrlId)).toEqual([2]);
    });

    it('si el email falla: el registro queda, se loguea y no lanza', async () => {
        const { deps, repo, sendAlert, logError } = setup({
            checks: [previousCheck()],
            previousProducts: [product({ normalPrice: 420000 })],
        });
        sendAlert.mockRejectedValueOnce(new Error('resend down'));
        const summary = await checkPrices(deps, { source: 'cron' });
        expect(summary).toEqual({ checked: 1, failed: 0, alerts: 0 });
        expect(repo.checks).toHaveLength(2);
        expect(logError).toHaveBeenCalled();
    });

    it('con trackedUrlId procesa solo esa URL, aunque esté pausada', async () => {
        const { deps, repo, solotodo } = setup({
            urls: [tracked({ id: 1, active: false }), tracked({ id: 2 })],
        });
        const summary = await checkPrices(deps, { source: 'manual', trackedUrlId: 1 });
        expect(summary.checked).toBe(1);
        expect(solotodo.browse).toHaveBeenCalledTimes(1);
        expect(repo.checks.map((c) => c.trackedUrlId)).toEqual([1]);
    });

    it('con trackedUrlId en needs_review o inexistente no procesa nada', async () => {
        const { deps, solotodo } = setup({
            urls: [tracked({ id: 1, status: 'needs_review', categoryId: null })],
        });
        await expect(checkPrices(deps, { source: 'manual', trackedUrlId: 1 })).resolves.toEqual({
            checked: 0,
            failed: 0,
            alerts: 0,
        });
        await expect(checkPrices(deps, { source: 'manual', trackedUrlId: 42 })).resolves.toEqual({
            checked: 0,
            failed: 0,
            alerts: 0,
        });
        expect(solotodo.browse).not.toHaveBeenCalled();
    });

    it('sin trackedUrlId usa solo las URLs chequeables del repo', async () => {
        const { deps, solotodo } = setup({
            urls: [tracked({ id: 1, active: false }), tracked({ id: 2, status: 'needs_review' }), tracked({ id: 3 })],
        });
        await checkPrices(deps, { source: 'cron' });
        expect(solotodo.browse).toHaveBeenCalledTimes(1);
    });
});

describe('checkPrices: productos del listado', () => {
    it('guarda todos los productos ordenados por precio normal con su position', async () => {
        const { deps, repo } = setup({
            entries: [
                entry({ productId: 1, normalPrice: 500000 }),
                entry({ productId: 2, normalPrice: 350000 }),
                entry({ productId: 3, normalPrice: 450000 }),
            ],
        });
        await checkPrices(deps, { source: 'cron' });
        const saved = repo.checks.at(-1)!;
        expect(saved).toMatchObject({ productId: 2, normalPrice: 350000 });
        expect(repo.productsByCheck.get(saved.id)?.map((p) => [p.productId, p.normalPrice, p.position])).toEqual([
            [2, 350000, 0],
            [3, 450000, 1],
            [1, 500000, 2],
        ]);
    });

    it('busca la tienda solo del producto más barato', async () => {
        const { deps, solotodo } = setup({
            entries: [entry({ productId: 1, normalPrice: 500000 }), entry({ productId: 2, normalPrice: 350000 })],
        });
        await checkPrices(deps, { source: 'cron' });
        expect(solotodo.getAvailableOffers).toHaveBeenCalledTimes(1);
        expect(solotodo.getAvailableOffers).toHaveBeenCalledWith(2);
    });

    it('también guarda los productos en chequeos manuales', async () => {
        const { deps, repo } = setup();
        await checkPrices(deps, { source: 'manual', trackedUrlId: 1 });
        expect(repo.productsByCheck.get(repo.checks.at(-1)!.id)).toEqual([product()]);
    });
});
