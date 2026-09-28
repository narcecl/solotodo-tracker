import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { PriceRepo } from '../check-prices';
import type { CheckProduct, Params, PriceCheck, TrackedUrl, TrackedUrlStatus } from '../types';
import { getDb } from './index';
import { priceChecks, trackedUrls, urlCheckProducts } from './schema';

const productColumns = {
    productId: urlCheckProducts.productId,
    name: urlCheckProducts.name,
    slug: urlCheckProducts.slug,
    normalPrice: urlCheckProducts.normalPrice,
    offerPrice: urlCheckProducts.offerPrice,
    position: urlCheckProducts.position,
};

export const priceRepo: PriceRepo = {
    async listCheckableUrls() {
        return getDb()
            .select()
            .from(trackedUrls)
            .where(and(eq(trackedUrls.active, true), eq(trackedUrls.status, 'ok')))
            .orderBy(asc(trackedUrls.id));
    },

    async getTrackedUrl(id) {
        const [row] = await getDb().select().from(trackedUrls).where(eq(trackedUrls.id, id));
        return row ?? null;
    },

    async getLastCheck(trackedUrlId) {
        const [row] = await getDb()
            .select()
            .from(priceChecks)
            .where(eq(priceChecks.trackedUrlId, trackedUrlId))
            .orderBy(desc(priceChecks.checkedAt), desc(priceChecks.id))
            .limit(1);
        return row ?? null;
    },

    async getCheckProducts(priceCheckId) {
        return getDb()
            .select(productColumns)
            .from(urlCheckProducts)
            .where(eq(urlCheckProducts.priceCheckId, priceCheckId))
            .orderBy(asc(urlCheckProducts.position));
    },

    async insertCheck(check, products) {
        // Resumen y productos se guardan juntos o no se guarda nada
        return getDb().transaction(async (tx) => {
            const [row] = await tx.insert(priceChecks).values(check).returning();
            if (products.length > 0) {
                await tx.insert(urlCheckProducts).values(products.map((p) => ({ ...p, priceCheckId: row.id })));
            }
            return row;
        });
    },
};

export async function listTrackedUrls(): Promise<TrackedUrl[]> {
    return getDb().select().from(trackedUrls).orderBy(asc(trackedUrls.id));
}

export async function listAllChecks(): Promise<PriceCheck[]> {
    return getDb().select().from(priceChecks).orderBy(asc(priceChecks.checkedAt), asc(priceChecks.id));
}

export async function listProductsForChecks(checkIds: number[]): Promise<Map<number, CheckProduct[]>> {
    const byCheck = new Map<number, CheckProduct[]>();
    if (checkIds.length === 0) return byCheck;
    const rows = await getDb()
        .select({ priceCheckId: urlCheckProducts.priceCheckId, ...productColumns })
        .from(urlCheckProducts)
        .where(inArray(urlCheckProducts.priceCheckId, checkIds))
        .orderBy(asc(urlCheckProducts.priceCheckId), asc(urlCheckProducts.position));
    for (const { priceCheckId, ...product } of rows) {
        const list = byCheck.get(priceCheckId) ?? [];
        list.push(product);
        byCheck.set(priceCheckId, list);
    }
    return byCheck;
}

export async function createTrackedUrl(input: {
    url: string;
    label: string;
    categoryId: number | null;
    params: Params;
    status: TrackedUrlStatus;
}): Promise<TrackedUrl> {
    const [row] = await getDb().insert(trackedUrls).values(input).returning();
    return row;
}

export type TrackedUrlUpdate = Partial<Pick<TrackedUrl, 'label' | 'url' | 'categoryId' | 'params' | 'status'>>;

export async function updateTrackedUrl(id: number, data: TrackedUrlUpdate): Promise<TrackedUrl | null> {
    const [row] = await getDb().update(trackedUrls).set(data).where(eq(trackedUrls.id, id)).returning();
    return row ?? null;
}

export async function setTrackedUrlActive(id: number, active: boolean): Promise<TrackedUrl | null> {
    const [row] = await getDb().update(trackedUrls).set({ active }).where(eq(trackedUrls.id, id)).returning();
    return row ?? null;
}

export async function deleteTrackedUrl(id: number): Promise<boolean> {
    const rows = await getDb().delete(trackedUrls).where(eq(trackedUrls.id, id)).returning({ id: trackedUrls.id });
    return rows.length > 0;
}
