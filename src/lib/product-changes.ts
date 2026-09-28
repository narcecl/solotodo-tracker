import type { BrowseEntry, CheckProduct, ProductChange, ProductChangeKind } from './types';

// Orden estable: en empate queda primero el que la API devolvió antes
export function toCheckProducts(entries: BrowseEntry[]): CheckProduct[] {
    return entries
        .toSorted((a, b) => a.normalPrice - b.normalPrice)
        .map((entry, position) => ({
            productId: entry.productId,
            name: entry.name,
            slug: entry.slug,
            normalPrice: entry.normalPrice,
            offerPrice: entry.offerPrice,
            position,
        }));
}

function kindOf(previous: number, current: number): ProductChangeKind {
    if (current < previous) return 'down';
    if (current > previous) return 'up';
    return 'same';
}

// Compara por product_id. Los productos que ya no están en `current` se ignoran.
export function diffProducts(current: CheckProduct[], previous: CheckProduct[]): ProductChange[] {
    const previousPrices = new Map(previous.map((p) => [p.productId, p.normalPrice]));
    return current
        .toSorted((a, b) => a.position - b.position)
        .map((product): ProductChange => {
            if (previous.length === 0) return { ...product, previousNormalPrice: null, kind: 'same' };
            const before = previousPrices.get(product.productId);
            if (before === undefined) return { ...product, previousNormalPrice: null, kind: 'new' };
            return { ...product, previousNormalPrice: before, kind: kindOf(before, product.normalPrice) };
        });
}

export function hasPriceChanges(changes: ProductChange[]): boolean {
    return changes.some((c) => c.kind === 'down' || c.kind === 'up');
}
