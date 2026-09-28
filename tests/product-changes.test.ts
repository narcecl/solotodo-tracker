import { describe, expect, it } from 'vitest';
import { diffProducts, hasPriceChanges, toCheckProducts } from '@/lib/product-changes';
import type { BrowseEntry, CheckProduct, ProductChange } from '@/lib/types';

const entry = (productId: number, normalPrice: number): BrowseEntry => ({
    productId,
    name: `P${productId}`,
    slug: `p${productId}`,
    normalPrice,
    offerPrice: normalPrice - 1000,
});

const product = (productId: number, normalPrice: number, position: number): CheckProduct => ({
    ...entry(productId, normalPrice),
    position,
});

describe('toCheckProducts', () => {
    it('ordena por precio normal y asigna position desde 0', () => {
        expect(toCheckProducts([entry(1, 500), entry(2, 300), entry(3, 400)])).toEqual([product(2, 300, 0), product(3, 400, 1), product(1, 500, 2)]);
    });

    it('en empate conserva el orden en que llegaron', () => {
        expect(toCheckProducts([entry(1, 300), entry(2, 300), entry(3, 100)]).map((p) => p.productId)).toEqual([3, 1, 2]);
    });

    it('lista vacía', () => {
        expect(toCheckProducts([])).toEqual([]);
    });
});

describe('diffProducts', () => {
    it('compara por product_id: bajó, subió, igual y nuevo', () => {
        const previous = [product(1, 100, 0), product(2, 200, 1), product(3, 300, 2)];
        const current = [product(4, 50, 0), product(1, 90, 1), product(2, 210, 2), product(3, 300, 3)];
        expect(diffProducts(current, previous).map((c) => [c.productId, c.kind, c.previousNormalPrice])).toEqual([
            [4, 'new', null],
            [1, 'down', 100],
            [2, 'up', 200],
            [3, 'same', 300],
        ]);
    });

    it('ignora los productos que desaparecieron', () => {
        const changes = diffProducts([product(1, 100, 0)], [product(2, 50, 0), product(1, 100, 1)]);
        expect(changes.map((c) => c.productId)).toEqual([1]);
        expect(changes[0].kind).toBe('same');
    });

    it('sin productos anteriores: todos same y sin precio anterior', () => {
        expect(diffProducts([product(1, 100, 0)], [])).toEqual([{ ...product(1, 100, 0), previousNormalPrice: null, kind: 'same' }]);
    });

    it('devuelve la lista ordenada por position', () => {
        const changes = diffProducts([product(2, 200, 1), product(1, 100, 0)], []);
        expect(changes.map((c) => c.position)).toEqual([0, 1]);
    });
});

describe('hasPriceChanges', () => {
    const change = (kind: ProductChange['kind'], previousNormalPrice: number | null): ProductChange => ({
        ...product(1, 100, 0),
        previousNormalPrice,
        kind,
    });

    it('es true solo si algún producto bajó o subió', () => {
        expect(hasPriceChanges([change('same', 100), change('new', null)])).toBe(false);
        expect(hasPriceChanges([change('same', 100), change('down', 120)])).toBe(true);
        expect(hasPriceChanges([change('up', 80)])).toBe(true);
        expect(hasPriceChanges([])).toBe(false);
    });
});
