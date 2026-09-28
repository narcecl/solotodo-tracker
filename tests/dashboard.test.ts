import { describe, expect, it } from 'vitest';
import { HISTORY_POINTS, buildDashboardRows, recentCheckIds, sparklinePoints } from '@/lib/dashboard';
import type { CheckProduct, PriceCheck, TrackedUrl } from '@/lib/types';

const url = (id: number): TrackedUrl => ({
    id,
    url: `https://www.solotodo.cl/x${id}`,
    label: `URL ${id}`,
    categoryId: 39,
    params: {},
    status: 'ok',
    active: true,
    createdAt: new Date('2026-09-01T00:00:00Z'),
});

let nextId = 1;
const check = (trackedUrlId: number, day: number, normalPrice: number): PriceCheck => ({
    id: nextId++,
    trackedUrlId,
    checkedAt: new Date(Date.UTC(2026, 8, day, 12)),
    source: 'cron',
    productId: 127681,
    productName: 'A-DATA',
    productSlug: 'a-data',
    normalPrice,
    offerPrice: normalPrice - 1000,
    storeName: null,
    storeUrl: null,
});

const product = (productId: number, normalPrice: number, position: number): CheckProduct => ({
    productId,
    name: `P${productId}`,
    slug: `p${productId}`,
    normalPrice,
    offerPrice: normalPrice - 1000,
    position,
});

describe('buildDashboardRows', () => {
    it('agrupa por URL, ordena por fecha y calcula último, anterior y tendencia', () => {
        const rows = buildDashboardRows(
            [url(1), url(2)],
            [check(1, 3, 390000), check(2, 1, 100), check(1, 1, 420000), check(1, 2, 400000)],
            new Map(),
        );
        expect(rows[0].latest?.normalPrice).toBe(390000);
        expect(rows[0].previous?.normalPrice).toBe(400000);
        expect(rows[0].trend).toBe('down');
        expect(rows[0].history).toEqual([420000, 400000, 390000]);
        expect(rows[0].productUrl).toBe('https://www.solotodo.cl/products/127681-a-data');
        expect(rows[1].trend).toBeNull();
    });

    it('tendencia up y same', () => {
        const [up] = buildDashboardRows([url(1)], [check(1, 1, 100), check(1, 2, 200)], new Map());
        const [same] = buildDashboardRows([url(1)], [check(1, 1, 100), check(1, 2, 100)], new Map());
        expect(up.trend).toBe('up');
        expect(same.trend).toBe('same');
    });

    it('URL sin chequeos', () => {
        const [row] = buildDashboardRows([url(1)], [], new Map());
        expect(row).toMatchObject({ latest: null, previous: null, trend: null, productUrl: null, history: [], products: [] });
    });

    it('limita el histórico a los últimos HISTORY_POINTS', () => {
        const checks = Array.from({ length: HISTORY_POINTS + 5 }, (_, i) => check(1, 1, i));
        checks.forEach((c, i) => (c.checkedAt = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000)));
        const [row] = buildDashboardRows([url(1)], checks, new Map());
        expect(row.history).toHaveLength(HISTORY_POINTS);
        expect(row.history.at(-1)).toBe(HISTORY_POINTS + 4);
    });
});

describe('buildDashboardRows: productos', () => {
    it('compara los productos del último chequeo contra el penúltimo', () => {
        const older = check(1, 1, 100);
        const newer = check(1, 2, 90);
        const products = new Map([
            [older.id, [product(1, 100, 0), product(2, 200, 1), product(3, 300, 2)]],
            [newer.id, [product(1, 90, 0), product(4, 150, 1), product(2, 200, 2)]],
        ]);
        const [row] = buildDashboardRows([url(1)], [newer, older], products);
        expect(row.products.map((p) => [p.productId, p.kind, p.previousNormalPrice])).toEqual([
            [1, 'down', 100],
            [4, 'new', null],
            [2, 'same', 200],
        ]);
    });

    it('si el penúltimo chequeo no tiene productos, no marca cambios', () => {
        const older = check(1, 1, 100);
        const newer = check(1, 2, 90);
        const [row] = buildDashboardRows([url(1)], [older, newer], new Map([[newer.id, [product(1, 90, 0)]]]));
        expect(row.products).toEqual([{ ...product(1, 90, 0), previousNormalPrice: null, kind: 'same' }]);
    });

    it('si el último chequeo no tiene productos (histórico), la lista queda vacía', () => {
        const older = check(1, 1, 100);
        const newer = check(1, 2, 90);
        const [row] = buildDashboardRows([url(1)], [older, newer], new Map([[older.id, [product(1, 100, 0)]]]));
        expect(row.products).toEqual([]);
    });
});

describe('recentCheckIds', () => {
    it('devuelve los dos últimos chequeos de cada URL, sin importar el orden de entrada', () => {
        const a1 = check(1, 1, 100);
        const a2 = check(1, 2, 100);
        const a3 = check(1, 3, 100);
        const b1 = check(2, 1, 100);
        expect(recentCheckIds([a3, b1, a1, a2]).toSorted((x, y) => x - y)).toEqual([a2.id, a3.id, b1.id].toSorted((x, y) => x - y));
    });

    it('sin chequeos', () => {
        expect(recentCheckIds([])).toEqual([]);
    });
});

describe('sparklinePoints', () => {
    it('escala al alto: el máximo arriba y el mínimo abajo', () => {
        expect(sparklinePoints([10, 20, 10], 100, 20)).toBe('0,20 50,0 100,20');
    });

    it('serie constante o de un solo punto: línea al medio', () => {
        expect(sparklinePoints([5, 5], 100, 20)).toBe('0,10 100,10');
        expect(sparklinePoints([5], 100, 20)).toBe('0,10 100,10');
    });

    it('respeta el padding vertical', () => {
        expect(sparklinePoints([0, 10], 100, 20, 2)).toBe('0,18 100,2');
    });

    it('serie vacía', () => {
        expect(sparklinePoints([], 100, 20)).toBe('');
    });
});
