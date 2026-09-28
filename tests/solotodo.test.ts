import { describe, expect, it } from "vitest";
import {
  API_BASE,
  SolotodoError,
  buildQuery,
  createSolotodoClient,
  productUrl,
} from "@/lib/solotodo";

type Route = { status?: number; body: unknown };

function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const path = url.replace(API_BASE, "").split("?")[0];
    const route = routes[path];
    if (!route) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fn, calls };
}

function browseEntry(id: number, name: string, slug: string, normal: string, offer: string) {
  return {
    bucket: String(id),
    product_entries: [
      {
        product: { id, name, slug, brand: { id: 1, name: "X" } },
        metadata: {
          score: 0,
          prices_per_currency: [
            { currency: 1, currency_id: 1, normal_price: normal, offer_price: offer },
          ],
          normal_price_usd: "1",
          offer_price_usd: "1",
        },
      },
    ],
  };
}

const BROWSE_PATH = "/categories/39/browse/";

describe("buildQuery", () => {
  it("conserva claves repetidas y agrega los extras", () => {
    const qs = buildQuery({ brands: ["1", "2"], bus: ["9"] }, { ordering: "normal_price_usd" });
    expect(qs).toBe("brands=1&brands=2&bus=9&ordering=normal_price_usd");
  });
});

describe("productUrl", () => {
  it("arma el link a la ficha de SoloTodo", () => {
    expect(productUrl(127681, "a-data-xpg")).toBe(
      "https://www.solotodo.cl/products/127681-a-data-xpg",
    );
  });
});

describe("browse", () => {
  it("mapea la primera página a entradas con precios CLP enteros", async () => {
    const { fn } = fakeFetch({
      [BROWSE_PATH]: {
        body: {
          count: 2,
          results: [
            browseEntry(127681, "A-DATA S70 2 TB", "a-data-s70", "400889.0", "379990.0"),
            browseEntry(125630, "Kingston KC3000 2 TB", "kingston-kc3000", "413062.00", "404170"),
          ],
        },
      },
    });
    const entries = await createSolotodoClient(fn).browse(39, { bus: ["1"] });
    expect(entries).toEqual([
      { productId: 127681, name: "A-DATA S70 2 TB", slug: "a-data-s70", normalPrice: 400889, offerPrice: 379990 },
      { productId: 125630, name: "Kingston KC3000 2 TB", slug: "kingston-kc3000", normalPrice: 413062, offerPrice: 404170 },
    ]);
  });

  it("envía todos los valores de claves repetidas y fuerza ordering por normal_price", async () => {
    const { fn, calls } = fakeFetch({ [BROWSE_PATH]: { body: { count: 0, results: [] } } });
    await createSolotodoClient(fn).browse(39, { brands: ["1", "2"], ordering: ["offer_price_usd"] });
    const query = new URL(calls[0]).searchParams;
    expect(query.getAll("brands")).toEqual(["1", "2"]);
    expect(query.getAll("ordering")).toEqual(["normal_price_usd"]);
  });

  it("devuelve [] cuando no hay resultados", async () => {
    const { fn } = fakeFetch({ [BROWSE_PATH]: { body: { count: 0, results: [] } } });
    await expect(createSolotodoClient(fn).browse(39, {})).resolves.toEqual([]);
  });

  it("lanza SolotodoError ante un error HTTP", async () => {
    const { fn } = fakeFetch({ [BROWSE_PATH]: { status: 500, body: { detail: "boom" } } });
    await expect(createSolotodoClient(fn).browse(39, {})).rejects.toBeInstanceOf(SolotodoError);
  });

  it("lanza SolotodoError si la respuesta no tiene la forma esperada", async () => {
    const { fn } = fakeFetch({ [BROWSE_PATH]: { body: { detail: "otra cosa" } } });
    await expect(createSolotodoClient(fn).browse(39, {})).rejects.toBeInstanceOf(SolotodoError);
  });

  it("lanza SolotodoError si un precio viene mal formado", async () => {
    const { fn } = fakeFetch({
      [BROWSE_PATH]: { body: { count: 1, results: [browseEntry(1, "X", "x", "N/A", "1")] } },
    });
    await expect(createSolotodoClient(fn).browse(39, {})).rejects.toBeInstanceOf(SolotodoError);
  });

  it("lanza SolotodoError si el producto no tiene precio en CLP", async () => {
    const entry = browseEntry(1, "X", "x", "10", "9");
    entry.product_entries[0].metadata.prices_per_currency[0].currency_id = 2;
    const { fn } = fakeFetch({ [BROWSE_PATH]: { body: { count: 1, results: [entry] } } });
    await expect(createSolotodoClient(fn).browse(39, {})).rejects.toBeInstanceOf(SolotodoError);
  });
});

describe("getAvailableOffers", () => {
  it("devuelve solo ofertas disponibles, visibles y en CLP", async () => {
    const entity = (store: number, registry: unknown, extra: Record<string, unknown> = {}) => ({
      id: store * 10,
      store,
      external_url: `https://tienda${store}.cl/p`,
      currency: 1,
      is_visible: true,
      active_registry: registry,
      ...extra,
    });
    const { fn } = fakeFetch({
      "/products/127681/entities/": {
        body: [
          entity(34, null),
          entity(35, { is_available: false, normal_price: "390000.00", offer_price: "380000.00" }),
          entity(5144, { is_available: true, normal_price: "400889.00", offer_price: "379990.00" }),
          entity(36, { is_available: true, normal_price: "1.00", offer_price: "1.00" }, { is_visible: false }),
          entity(37, { is_available: true, normal_price: "2.00", offer_price: "2.00" }, { currency: 2 }),
        ],
      },
    });
    const offers = await createSolotodoClient(fn).getAvailableOffers(127681);
    expect(offers).toEqual([
      { storeId: 5144, url: "https://tienda5144.cl/p", normalPrice: 400889 },
    ]);
  });

  it("devuelve [] si ninguna oferta está disponible", async () => {
    const { fn } = fakeFetch({
      "/products/1/entities/": {
        body: [{ id: 1, store: 34, external_url: "u", currency: 1, is_visible: true, active_registry: null }],
      },
    });
    await expect(createSolotodoClient(fn).getAvailableOffers(1)).resolves.toEqual([]);
  });
});

describe("getStores", () => {
  it("devuelve un mapa id → nombre", async () => {
    const { fn } = fakeFetch({
      "/stores/": { body: [{ id: 34, name: "PC Express", country: 1 }, { id: 5144, name: "MyShop", country: 1 }] },
    });
    const stores = await createSolotodoClient(fn).getStores();
    expect(stores.get(5144)).toBe("MyShop");
    expect(stores.get(34)).toBe("PC Express");
  });
});
