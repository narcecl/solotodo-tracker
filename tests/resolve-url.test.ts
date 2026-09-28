import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  InvalidUrlError,
  extractLandingConfig,
  mergeParams,
  parseSolotodoUrl,
  resolveUrl,
  type ResolveDeps,
} from "@/lib/resolve-url";
import type { BrowseEntry } from "@/lib/types";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const USER_URL =
  "https://www.solotodo.cl/ssd-m2-pcie-nvme?ordering=offer_price_usd&base_buses=1559281&bus=1559594&formats=1560419&nand_types=1460586&has_dram=1460588&capacity_min=532223";

const ENTRY: BrowseEntry = {
  productId: 127681,
  name: "A-DATA XPG Gammix S70 BLADE 2 TB",
  slug: "a-data-xpg-gammix-s70-blade-2-tb",
  normalPrice: 400889,
  offerPrice: 379990,
};

describe("parseSolotodoUrl", () => {
  it.each([
    "https://www.solotodo.cl/ssd-m2-pcie-nvme",
    "https://solotodo.cl/ssd-m2-pcie-nvme",
    "http://www.solotodo.cl/ssd-m2-pcie-nvme",
    "   https://www.solotodo.cl/ssd-m2-pcie-nvme?bus=1  ",
  ])("acepta %s", (raw) => {
    expect(parseSolotodoUrl(raw).pathname).toBe("/ssd-m2-pcie-nvme");
  });

  it.each([
    "no es una url",
    "ftp://www.solotodo.cl/ssd-m2-pcie-nvme",
    "https://solotodo.cl.evil.com/ssd-m2-pcie-nvme",
    "https://evil.com/?next=www.solotodo.cl",
    "https://www.solotodo.cl/products/127681-a-data-xpg",
  ])("rechaza %s", (raw) => {
    expect(() => parseSolotodoUrl(raw)).toThrow(InvalidUrlError);
  });
});

describe("extractLandingConfig", () => {
  it("extrae categoría y params implícitos de una landing", () => {
    expect(extractLandingConfig(fixture("solotodo-landing-ssd-m2-pcie-nvme.html"))).toEqual({
      categoryId: 39,
      implicitParams: "format_families=1560421&base_buses=1559281",
    });
  });

  it("extrae la categoría de una página de categoría sin landing", () => {
    expect(extractLandingConfig(fixture("solotodo-category-ssds.html"))).toEqual({
      categoryId: 39,
      implicitParams: "",
    });
  });

  it("devuelve null si la página no es un listado", () => {
    expect(extractLandingConfig("<html><body>404</body></html>")).toBeNull();
    const productLike =
      '<script>self.__next_f.push([1,"{\\"category\\":{\\"id\\":39}}"])</script>';
    expect(extractLandingConfig(productLike)).toBeNull();
  });
});

describe("mergeParams", () => {
  it("combina implícitos y query; la clave de la URL gana", () => {
    const query = new URLSearchParams("base_buses=999&bus=1559594");
    expect(mergeParams("format_families=1560421&base_buses=1559281", query)).toEqual({
      format_families: ["1560421"],
      base_buses: ["999"],
      bus: ["1559594"],
    });
  });

  it("conserva claves repetidas", () => {
    expect(mergeParams("", new URLSearchParams("brands=1&brands=2"))).toEqual({
      brands: ["1", "2"],
    });
  });

  it("descarta ordering, page, page_size y valores vacíos", () => {
    const query = new URLSearchParams("ordering=offer_price_usd&page=3&page_size=50&search=&bus=1");
    expect(mergeParams("ordering=x", query)).toEqual({ bus: ["1"] });
  });
});

function deps(overrides: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    fetchHtml: vi.fn(async () => fixture("solotodo-landing-ssd-m2-pcie-nvme.html")),
    browse: vi.fn(async () => [ENTRY]),
    ...overrides,
  };
}

describe("resolveUrl", () => {
  it("resuelve la URL de ejemplo a categoría 39 con params combinados y status ok", async () => {
    const d = deps();
    const resolved = await resolveUrl(USER_URL, d);
    const expectedParams = {
      format_families: ["1560421"],
      base_buses: ["1559281"],
      bus: ["1559594"],
      formats: ["1560419"],
      nand_types: ["1460586"],
      has_dram: ["1460588"],
      capacity_min: ["532223"],
    };
    expect(resolved).toEqual({
      url: USER_URL,
      categoryId: 39,
      params: expectedParams,
      status: "ok",
    });
    expect(d.browse).toHaveBeenCalledWith(39, expectedParams);
  });

  it("queda en needs_review sin categoría si no se puede descargar la página", async () => {
    const resolved = await resolveUrl(
      USER_URL,
      deps({ fetchHtml: vi.fn(async () => { throw new Error("404"); }) }),
    );
    expect(resolved.status).toBe("needs_review");
    expect(resolved.categoryId).toBeNull();
  });

  it("queda en needs_review si el listado de prueba no trae resultados", async () => {
    const resolved = await resolveUrl(USER_URL, deps({ browse: vi.fn(async () => []) }));
    expect(resolved).toMatchObject({ status: "needs_review", categoryId: 39 });
  });

  it("queda en needs_review si la llamada de prueba falla", async () => {
    const resolved = await resolveUrl(
      USER_URL,
      deps({ browse: vi.fn(async () => { throw new Error("500"); }) }),
    );
    expect(resolved).toMatchObject({ status: "needs_review", categoryId: 39 });
  });

  it("rechaza hosts inválidos sin hacer requests", async () => {
    const d = deps();
    await expect(resolveUrl("https://evil.com/x", d)).rejects.toThrow(InvalidUrlError);
    expect(d.fetchHtml).not.toHaveBeenCalled();
  });
});
