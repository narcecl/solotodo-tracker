import { z } from "zod";
import type { BrowseEntry, Params, StoreOffer } from "./types";

export const API_BASE = "https://api.solotodo.com";
const CLP_CURRENCY_ID = 1;
const TIMEOUT_MS = 15_000;

export class SolotodoError extends Error {}

const price = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .transform((value) => Math.round(Number(value)));

const browseSchema = z.object({
  results: z.array(
    z.object({
      product_entries: z
        .array(
          z.object({
            product: z.object({ id: z.number(), name: z.string(), slug: z.string() }),
            metadata: z.object({
              prices_per_currency: z.array(
                z.object({ currency_id: z.number(), normal_price: price, offer_price: price }),
              ),
            }),
          }),
        )
        .min(1),
    }),
  ),
});

const entitiesSchema = z.array(
  z.object({
    store: z.number(),
    external_url: z.string(),
    currency: z.number(),
    is_visible: z.boolean(),
    active_registry: z.object({ is_available: z.boolean(), normal_price: price }).nullable(),
  }),
);

const storesSchema = z.array(z.object({ id: z.number(), name: z.string() }));

export interface SolotodoClient {
  browse(categoryId: number, params: Params): Promise<BrowseEntry[]>;
  getAvailableOffers(productId: number): Promise<StoreOffer[]>;
  getStores(): Promise<Map<number, string>>;
}

export function buildQuery(params: Params, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams();
  for (const [key, values] of Object.entries(params)) {
    for (const value of values) query.append(key, value);
  }
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  return query.toString();
}

export function productUrl(productId: number, slug: string): string {
  return `https://www.solotodo.cl/products/${productId}-${slug}`;
}

function parse<S extends z.ZodType>(schema: S, data: unknown, path: string): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new SolotodoError(`Respuesta inesperada de ${path}: ${result.error.message}`);
  }
  return result.data;
}

export function createSolotodoClient(fetchFn: typeof fetch = fetch): SolotodoClient {
  async function getJson(path: string): Promise<unknown> {
    const response = await fetchFn(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new SolotodoError(`GET ${path} respondió ${response.status}`);
    return response.json();
  }

  return {
    async browse(categoryId, params) {
      const path = `/categories/${categoryId}/browse/?${buildQuery(params, { ordering: "normal_price_usd" })}`;
      const data = parse(browseSchema, await getJson(path), path);
      return data.results.map((bucket) => {
        const entry = bucket.product_entries[0];
        const clp = entry.metadata.prices_per_currency.find(
          (p) => p.currency_id === CLP_CURRENCY_ID,
        );
        if (!clp) throw new SolotodoError(`El producto ${entry.product.id} no tiene precio en CLP`);
        return {
          productId: entry.product.id,
          name: entry.product.name,
          slug: entry.product.slug,
          normalPrice: clp.normal_price,
          offerPrice: clp.offer_price,
        };
      });
    },

    async getAvailableOffers(productId) {
      const path = `/products/${productId}/entities/`;
      const data = parse(entitiesSchema, await getJson(path), path);
      return data.flatMap((entity) =>
        entity.active_registry?.is_available &&
        entity.is_visible &&
        entity.currency === CLP_CURRENCY_ID
          ? [
              {
                storeId: entity.store,
                url: entity.external_url,
                normalPrice: entity.active_registry.normal_price,
              },
            ]
          : [],
      );
    },

    async getStores() {
      const path = "/stores/";
      const data = parse(storesSchema, await getJson(path), path);
      return new Map(data.map((store) => [store.id, store.name]));
    },
  };
}
