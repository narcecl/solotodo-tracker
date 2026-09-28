import { toCheckProducts } from "./product-changes";
import { productUrl, type SolotodoClient } from "./solotodo";
import type {
  CheckProduct,
  CheckSource,
  NewPriceCheck,
  PriceCheck,
  PriceDropAlert,
  StoreOffer,
  TrackedUrl,
} from "./types";

export interface PriceRepo {
  listCheckableUrls(): Promise<TrackedUrl[]>;
  getTrackedUrl(id: number): Promise<TrackedUrl | null>;
  getLastCheck(trackedUrlId: number): Promise<PriceCheck | null>;
  getCheckProducts(priceCheckId: number): Promise<CheckProduct[]>;
  insertCheck(check: NewPriceCheck, products: CheckProduct[]): Promise<PriceCheck>;
}

export interface CheckDeps {
  repo: PriceRepo;
  solotodo: SolotodoClient;
  sendAlert(alert: PriceDropAlert): Promise<void>;
  logError(message: string, error: unknown): void;
}

export interface CheckOptions {
  source: CheckSource;
  trackedUrlId?: number;
}

export interface CheckSummary {
  checked: number;
  failed: number;
  alerts: number;
}

interface StoreInfo {
  name: string | null;
  url: string | null;
}

const NO_STORE: StoreInfo = { name: null, url: null };

function cheapestBy<T extends { normalPrice: number }>(items: T[]): T | null {
  return items.reduce<T | null>(
    (min, item) => (min === null || item.normalPrice < min.normalPrice ? item : min),
    null,
  );
}

async function selectUrls(repo: PriceRepo, trackedUrlId?: number): Promise<TrackedUrl[]> {
  if (trackedUrlId === undefined) return repo.listCheckableUrls();
  const tracked = await repo.getTrackedUrl(trackedUrlId);
  return tracked && tracked.status === "ok" ? [tracked] : [];
}

async function findStore(
  deps: CheckDeps,
  productId: number,
  getStores: () => Promise<Map<number, string>>,
): Promise<StoreInfo> {
  try {
    const best: StoreOffer | null = cheapestBy(await deps.solotodo.getAvailableOffers(productId));
    if (!best) return NO_STORE;
    const stores = await getStores();
    return { name: stores.get(best.storeId) ?? null, url: best.url };
  } catch (error) {
    deps.logError(`No se pudo obtener la tienda del producto ${productId}`, error);
    return NO_STORE;
  }
}

async function checkOne(
  deps: CheckDeps,
  tracked: TrackedUrl,
  source: CheckSource,
  getStores: () => Promise<Map<number, string>>,
): Promise<boolean> {
  if (tracked.categoryId === null) throw new Error("La URL no tiene categoría resuelta");

  const products = toCheckProducts(await deps.solotodo.browse(tracked.categoryId, tracked.params));
  const cheapest = products[0];
  if (!cheapest) throw new Error("El listado no devolvió resultados");

  const store = await findStore(deps, cheapest.productId, getStores);
  const previous = await deps.repo.getLastCheck(tracked.id);
  const check = await deps.repo.insertCheck(
    {
      trackedUrlId: tracked.id,
      source,
      productId: cheapest.productId,
      productName: cheapest.name,
      productSlug: cheapest.slug,
      normalPrice: cheapest.normalPrice,
      offerPrice: cheapest.offerPrice,
      storeName: store.name,
      storeUrl: store.url,
    },
    products,
  );

  if (source !== "cron" || previous === null || check.normalPrice >= previous.normalPrice) {
    return false;
  }

  try {
    await deps.sendAlert({
      label: tracked.label,
      productName: check.productName,
      productUrl: productUrl(check.productId, check.productSlug),
      previousPrice: previous.normalPrice,
      newPrice: check.normalPrice,
      offerPrice: check.offerPrice,
      storeName: check.storeName,
      storeUrl: check.storeUrl,
    });
    return true;
  } catch (error) {
    deps.logError(`No se pudo enviar la alerta de "${tracked.label}"`, error);
    return false;
  }
}

export async function checkPrices(deps: CheckDeps, options: CheckOptions): Promise<CheckSummary> {
  const urls = await selectUrls(deps.repo, options.trackedUrlId);
  const summary: CheckSummary = { checked: 0, failed: 0, alerts: 0 };

  let storesPromise: Promise<Map<number, string>> | null = null;
  const getStores = () => (storesPromise ??= deps.solotodo.getStores());

  for (const tracked of urls) {
    try {
      const alerted = await checkOne(deps, tracked, options.source, getStores);
      summary.checked += 1;
      if (alerted) summary.alerts += 1;
    } catch (error) {
      summary.failed += 1;
      deps.logError(`Chequeo fallido para "${tracked.label}" (#${tracked.id})`, error);
    }
  }
  return summary;
}
