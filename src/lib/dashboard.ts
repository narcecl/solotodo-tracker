import { productUrl } from "./solotodo";
import type { PriceCheck, TrackedUrl } from "./types";

export const HISTORY_POINTS = 30;

export type Trend = "down" | "up" | "same";

export interface DashboardRow {
  tracked: TrackedUrl;
  latest: PriceCheck | null;
  previous: PriceCheck | null;
  trend: Trend | null;
  productUrl: string | null;
  history: number[];
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

export function buildDashboardRows(urls: TrackedUrl[], checks: PriceCheck[]): DashboardRow[] {
  const byUrl = new Map<number, PriceCheck[]>();
  for (const check of checks) {
    const list = byUrl.get(check.trackedUrlId) ?? [];
    list.push(check);
    byUrl.set(check.trackedUrlId, list);
  }

  return urls.map((tracked) => {
    const list = (byUrl.get(tracked.id) ?? []).toSorted(compareChecks);
    const latest = list.at(-1) ?? null;
    const previous = list.at(-2) ?? null;
    return {
      tracked,
      latest,
      previous,
      trend: trendOf(previous, latest),
      productUrl: latest ? productUrl(latest.productId, latest.productSlug) : null,
      history: list.slice(-HISTORY_POINTS).map((c) => c.normalPrice),
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
