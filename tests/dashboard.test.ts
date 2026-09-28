import { describe, expect, it } from "vitest";
import { HISTORY_POINTS, buildDashboardRows, sparklinePoints } from "@/lib/dashboard";
import type { PriceCheck, TrackedUrl } from "@/lib/types";

const url = (id: number): TrackedUrl => ({
  id,
  url: `https://www.solotodo.cl/x${id}`,
  label: `URL ${id}`,
  categoryId: 39,
  params: {},
  status: "ok",
  active: true,
  createdAt: new Date("2026-09-01T00:00:00Z"),
});

let nextId = 1;
const check = (trackedUrlId: number, day: number, normalPrice: number): PriceCheck => ({
  id: nextId++,
  trackedUrlId,
  checkedAt: new Date(Date.UTC(2026, 8, day, 12)),
  source: "cron",
  productId: 127681,
  productName: "A-DATA",
  productSlug: "a-data",
  normalPrice,
  offerPrice: normalPrice - 1000,
  storeName: null,
  storeUrl: null,
});

describe("buildDashboardRows", () => {
  it("agrupa por URL, ordena por fecha y calcula último, anterior y tendencia", () => {
    const rows = buildDashboardRows(
      [url(1), url(2)],
      [check(1, 3, 390000), check(2, 1, 100), check(1, 1, 420000), check(1, 2, 400000)],
    );
    expect(rows[0].latest?.normalPrice).toBe(390000);
    expect(rows[0].previous?.normalPrice).toBe(400000);
    expect(rows[0].trend).toBe("down");
    expect(rows[0].history).toEqual([420000, 400000, 390000]);
    expect(rows[0].productUrl).toBe("https://www.solotodo.cl/products/127681-a-data");
    expect(rows[1].trend).toBeNull();
  });

  it("tendencia up y same", () => {
    const [up] = buildDashboardRows([url(1)], [check(1, 1, 100), check(1, 2, 200)]);
    const [same] = buildDashboardRows([url(1)], [check(1, 1, 100), check(1, 2, 100)]);
    expect(up.trend).toBe("up");
    expect(same.trend).toBe("same");
  });

  it("URL sin chequeos", () => {
    const [row] = buildDashboardRows([url(1)], []);
    expect(row).toMatchObject({ latest: null, previous: null, trend: null, productUrl: null, history: [] });
  });

  it("limita el histórico a los últimos HISTORY_POINTS", () => {
    const checks = Array.from({ length: HISTORY_POINTS + 5 }, (_, i) => check(1, 1, i));
    checks.forEach((c, i) => (c.checkedAt = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000)));
    const [row] = buildDashboardRows([url(1)], checks);
    expect(row.history).toHaveLength(HISTORY_POINTS);
    expect(row.history.at(-1)).toBe(HISTORY_POINTS + 4);
  });
});

describe("sparklinePoints", () => {
  it("escala al alto: el máximo arriba y el mínimo abajo", () => {
    expect(sparklinePoints([10, 20, 10], 100, 20)).toBe("0,20 50,0 100,20");
  });

  it("serie constante o de un solo punto: línea al medio", () => {
    expect(sparklinePoints([5, 5], 100, 20)).toBe("0,10 100,10");
    expect(sparklinePoints([5], 100, 20)).toBe("0,10 100,10");
  });

  it("respeta el padding vertical", () => {
    expect(sparklinePoints([0, 10], 100, 20, 2)).toBe("0,18 100,2");
  });

  it("serie vacía", () => {
    expect(sparklinePoints([], 100, 20)).toBe("");
  });
});
