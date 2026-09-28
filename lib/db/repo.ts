import { and, asc, desc, eq } from "drizzle-orm";
import type { PriceRepo } from "../check-prices";
import type { Params, PriceCheck, TrackedUrl, TrackedUrlStatus } from "../types";
import { getDb } from "./index";
import { priceChecks, trackedUrls } from "./schema";

export const priceRepo: PriceRepo = {
  async listCheckableUrls() {
    return getDb()
      .select()
      .from(trackedUrls)
      .where(and(eq(trackedUrls.active, true), eq(trackedUrls.status, "ok")))
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

  async insertCheck(check) {
    const [row] = await getDb().insert(priceChecks).values(check).returning();
    return row;
  },
};

export async function listTrackedUrls(): Promise<TrackedUrl[]> {
  return getDb().select().from(trackedUrls).orderBy(asc(trackedUrls.id));
}

export async function listAllChecks(): Promise<PriceCheck[]> {
  return getDb().select().from(priceChecks).orderBy(asc(priceChecks.checkedAt), asc(priceChecks.id));
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

export async function setTrackedUrlActive(id: number, active: boolean): Promise<TrackedUrl | null> {
  const [row] = await getDb()
    .update(trackedUrls)
    .set({ active })
    .where(eq(trackedUrls.id, id))
    .returning();
  return row ?? null;
}

export async function deleteTrackedUrl(id: number): Promise<boolean> {
  const rows = await getDb()
    .delete(trackedUrls)
    .where(eq(trackedUrls.id, id))
    .returning({ id: trackedUrls.id });
  return rows.length > 0;
}
