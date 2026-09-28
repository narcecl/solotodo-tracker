import { diffProducts } from "./product-changes";
import { productUrl } from "./solotodo";
import type { CheckProduct, PriceCheck, ProductChange, TrackedUrl } from "./types";

export const HISTORY_POINTS = 30;

export type Trend = "down" | "up" | "same";

export interface DashboardRow {
  tracked: TrackedUrl;
  latest: PriceCheck | null;
  previous: PriceCheck | null;
  trend: Trend | null;
  productUrl: string | null;
  history: number[];
  products: ProductChange[];
}

function compareChecks(a: PriceCheck, b: PriceCheck): number {
  return a.checkedAt.getTime() - b.checkedAt.getTime() || a.id - b.id;
}

function trendOf(previous: PriceCheck | null, latest: PriceCheck | null): Trend | null {
  if (!previous || !latest) return null;
  if (latest.normalPrice < previous.normalPrice) return "down";
  if (latest.normalPrice > previous.normalPrice) return "up";
  return "same";
}

function checksByUrl(checks: PriceCheck[]): Map<number, PriceCheck[]> {
  const byUrl = new Map<number, PriceCheck[]>();
  for (const check of checks) {
    const list = byUrl.get(check.trackedUrlId) ?? [];
    list.push(check);
    byUrl.set(check.trackedUrlId, list);
  }
  for (const [id, list] of byUrl) byUrl.set(id, list.toSorted(compareChecks));
  return byUrl;
}

export function recentCheckIds(checks: PriceCheck[], perUrl = 2): number[] {
  return [...checksByUrl(checks).values()].flatMap((list) => list.slice(-perUrl).map((c) => c.id));
}

export function buildDashboardRows(
  urls: TrackedUrl[],
  checks: PriceCheck[],
  productsByCheck: Map<number, CheckProduct[]>,
): DashboardRow[] {
  const byUrl = checksByUrl(checks);
  const productsOf = (check: PriceCheck | null) => (check ? (productsByCheck.get(check.id) ?? []) : []);

  return urls.map((tracked) => {
    const list = byUrl.get(tracked.id) ?? [];
    const latest = list.at(-1) ?? null;
    const previous = list.at(-2) ?? null;
    return {
      tracked,
      latest,
      previous,
      trend: trendOf(previous, latest),
      productUrl: latest ? productUrl(latest.productId, latest.productSlug) : null,
      history: list.slice(-HISTORY_POINTS).map((c) => c.normalPrice),
      products: diffProducts(productsOf(latest), productsOf(previous)),
    };
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function sparklinePoints(values: number[], width: number, height: number, padding = 0): string {
  if (values.length === 0) return "";
  const series = values.length === 1 ? [values[0], values[0]] : values;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const innerHeight = height - padding * 2;
  const stepX = width / (series.length - 1);
  return series
    .map((value, i) => {
      const y = max === min ? height / 2 : padding + ((max - value) / (max - min)) * innerHeight;
      return `${round2(i * stepX)},${round2(y)}`;
    })
    .join(" ");
}
