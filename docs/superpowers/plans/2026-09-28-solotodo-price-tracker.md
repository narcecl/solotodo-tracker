# SoloTodo Price Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una app personal Next.js 16 que sigue listados filtrados de SoloTodo, guarda a diario el precio del producto más barato (por `normal_price`) y envía un email cuando baja en un chequeo del cron.

**Architecture:** La lógica de dominio vive en `lib/` como funciones puras o con dependencias inyectadas (cliente de la API de SoloTodo, resolución de URLs, `checkPrices`, email), testeadas con Vitest sin red ni base de datos. Drizzle + Neon implementa un repositorio con interfaz `PriceRepo`. Dos entry points comparten `checkPrices`: la ruta `/api/check-prices` (Vercel Cron vía GET + `CRON_SECRET`, refresh manual vía POST) y `scripts/check-prices.ts` (cron local con `launchd`). El dashboard es una página server-rendered con componentes cliente mínimos para las acciones.

**Tech Stack:** Next.js 16.3 (App Router, `/app`, TypeScript, Tailwind 4), Drizzle ORM 0.45 + drizzle-kit 0.31, `@neondatabase/serverless` 1.x, Resend 6.x, Zod 4, Vitest 5, tsx 4, Node 24.

**Spec:** `docs/superpowers/specs/2026-09-28-solotodo-price-tracker-design.md`

## Global Constraints

- Next.js 16 con App Router en la carpeta `/app` (sin `src/`). Antes de escribir código de Next (páginas, route handlers, config), leer la guía relevante en `node_modules/next/dist/docs/` (lo exige el `AGENTS.md` generado por `create-next-app`).
- Postgres gestionado en Neon desde el día uno; acceso con Drizzle ORM. No usar SQLite.
- Emails con Resend. Tests con Vitest.
- Variables de entorno: `DATABASE_URL`, `RESEND_API_KEY`, `ALERT_EMAIL`, `CRON_SECRET` (más `ALERT_FROM` opcional, con default `SoloTodo Tracker <onboarding@resend.dev>`). Localmente viven en `.env.local` (no se commitea).
- API de SoloTodo: `https://api.solotodo.com`, sin autenticación. Listados: `GET /categories/{category_id}/browse/`. Ofertas por tienda: `GET /products/{id}/entities/`. Tiendas: `GET /stores/`. Moneda CLP = `currency_id` 1.
- Precios en CLP como enteros. Comparación y alertas **solo** por `normal_price`; `offer_price` es informativo.
- Solo `source: "cron"` puede enviar email. `source` se deduce del entry point (GET autenticado o script = cron; POST del dashboard = manual), nunca de un parámetro del cliente.
- La tienda (`store_name`, `store_url`) es solo informativa: nunca participa en la comparación ni en las alertas, y su falla nunca impide insertar el chequeo.
- Textos visibles al usuario en español.
- Imports dentro de `lib/` y `scripts/` son relativos (así funcionan igual en Next, Vitest y tsx). En `app/` y `tests/` se puede usar el alias `@/`.

## Review Focus

- **URLs con filtros multivalor** (ej. `brands=1&brands=2`): todos los valores deben llegar a la API; perder uno cambia el listado sin avisar. → Tests en Task 2 (`buildQuery`) y Task 3 (`mergeParams`).
- **Variantes de URL pegada** (`solotodo.cl` sin `www`, `http://`, espacios alrededor, `ordering`/`page` en la query, hosts parecidos como `solotodo.cl.evil.com`): las válidas se aceptan y normalizan; las parecidas se rechazan. → Tests en Task 3 (`parseSolotodoUrl`, `mergeParams`).
- **Precios como string con decimales** (`"400889.0"`, `"400889.00"`) o mal formados: deben quedar como enteros; uno mal formado debe fallar como error de forma, nunca guardarse como `NaN`. → Tests en Task 2.
- **Producto sin ninguna oferta disponible** (todas con `active_registry: null` o `is_available: false`): tienda en null, chequeo insertado igual. → Tests en Task 2 (`getAvailableOffers`) y Task 4.
- **Resend devuelve `{ error }` sin lanzar excepción**: debe tratarse como falla (se loguea) y no como envío exitoso. → Tests en Task 5.

---

## File Structure

```
solotodo-tracker/
├── app/
│   ├── layout.tsx                         # (modificado) lang="es", metadata
│   ├── page.tsx                           # Dashboard (server component)
│   ├── components/
│   │   ├── add-url-form.tsx               # Cliente: formulario de alta
│   │   ├── row-actions.tsx                # Cliente: refrescar / pausar / eliminar
│   │   ├── tracked-url-row.tsx            # Server: una fila del dashboard
│   │   └── sparkline.tsx                  # Server: SVG del histórico
│   └── api/
│       ├── check-prices/route.ts          # GET (cron) / POST (manual)
│       └── tracked-urls/
│           ├── route.ts                   # POST alta
│           └── [id]/route.ts              # PATCH active / DELETE
├── lib/
│   ├── types.ts                           # Tipos de dominio compartidos
│   ├── format.ts                          # formatCLP, formatDateTime
│   ├── solotodo.ts                        # Cliente API SoloTodo + productUrl
│   ├── resolve-url.ts                     # URL solotodo.cl → categoría + params
│   ├── check-prices.ts                    # checkPrices + interfaz PriceRepo
│   ├── email.ts                           # buildAlertEmail + createAlertSender
│   ├── dashboard.ts                       # buildDashboardRows + sparklinePoints
│   ├── deps.ts                            # Cableado de dependencias reales
│   └── db/
│       ├── schema.ts                      # Tablas Drizzle
│       ├── index.ts                       # getDb() perezoso
│       └── repo.ts                        # priceRepo + funciones del dashboard
├── scripts/
│   ├── check-prices.ts                    # Entry point del cron local
│   └── install-launchd.sh                 # Instala el LaunchAgent diario
├── tests/                                 # Vitest (un archivo por módulo)
│   └── fixtures/                          # HTML real de SoloTodo
├── drizzle/                               # Migraciones generadas
├── drizzle.config.ts
├── vitest.config.ts
├── vercel.json
└── .env.example
```

---

### Task 1: Scaffold del proyecto, tooling de tests y formateo

**Files:**
- Create (via `create-next-app`): `package.json`, `app/*`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `AGENTS.md`, `CLAUDE.md`, etc.
- Create: `vitest.config.ts`, `.env.example`, `lib/format.ts`
- Modify: `package.json` (scripts), `.gitignore`, `app/layout.tsx`
- Test: `tests/format.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `formatCLP(amount: number): string` → ej. `"$400.889"`
  - `formatDateTime(date: Date): string` → fecha y hora en `America/Santiago`, locale `es-CL`
  - Scripts npm: `test`, `typecheck`, `db:generate`, `db:migrate`, `check-prices`
  - Alias `@/` → raíz del repo, en Next y en Vitest.

- [ ] **Step 1: Generar el proyecto Next.js 16 en el repo existente**

El repo ya tiene `.git` y `docs/`; `create-next-app` los acepta. Ejecutar desde `/Users/narcecl/Desarrollo/solotodo-tracker`:

```bash
npx -y create-next-app@16 . --ts --app --tailwind --eslint --no-src-dir --no-react-compiler --import-alias "@/*" --use-npm --yes
```

Expected: termina con `Success! Created solotodo-tracker`, y existen `app/page.tsx`, `app/layout.tsx`, `AGENTS.md`, `package.json` con `"next": "16.x"`.

- [ ] **Step 2: Instalar dependencias del proyecto**

`@types/node` se sube a ^24 en el mismo comando porque Vitest 5 exige `@types/node` ^22 o >=24 como peer (el scaffold trae ^20).

```bash
npm install drizzle-orm@^0.45 @neondatabase/serverless@^1 resend@^6 zod@^4
npm install -D vitest@^5 tsx@^4 drizzle-kit@^0.31 @types/node@^24
```

Expected: ambos comandos terminan sin `ERESOLVE`.

- [ ] **Step 3: Configurar Vitest con el alias `@/`**

Create `vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@/": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Agregar scripts npm**

En `package.json`, dejar el bloque `scripts` así (conserva los generados y agrega el resto). `typecheck` corre `next typegen` primero porque `LayoutProps` y `RouteContext` son tipos globales generados por Next:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "next typegen && tsc --noEmit",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "check-prices": "tsx scripts/check-prices.ts"
}
```

- [ ] **Step 5: Variables de entorno de ejemplo y `.gitignore`**

El `.gitignore` generado ignora `.env*`, lo que también ignoraría `.env.example`. Agregar al final de `.gitignore`:

```
!.env.example

# logs del cron local
/logs
```

Create `.env.example`:

```
# Postgres de Neon (connection string "pooled" del dashboard de Neon)
DATABASE_URL=postgresql://user:password@host.neon.tech/neondb?sslmode=require
# API key de Resend
RESEND_API_KEY=re_xxxxxxxxxxxx
# Destinatario de las alertas. Con el remitente onboarding@resend.dev, debe ser el email de la cuenta de Resend.
ALERT_EMAIL=hola@narce.cl
# Opcional. Remitente; requiere dominio verificado en Resend si no es onboarding@resend.dev
ALERT_FROM=SoloTodo Tracker <onboarding@resend.dev>
# Secreto del cron. Generar con: openssl rand -hex 32
CRON_SECRET=
```

- [ ] **Step 6: Escribir el test de formateo que falla**

Create `tests/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatCLP, formatDateTime } from "@/lib/format";

describe("formatCLP", () => {
  it("formatea pesos chilenos con separador de miles y sin decimales", () => {
    expect(formatCLP(400889)).toBe("$400.889");
    expect(formatCLP(0)).toBe("$0");
  });
});

describe("formatDateTime", () => {
  it("muestra fecha y hora en la zona horaria de Santiago", () => {
    // 12:00 UTC = 09:00 en Santiago (UTC-3 en septiembre)
    const text = formatDateTime(new Date("2026-09-28T12:00:00Z"));
    expect(text).toContain("28-09-2026");
    expect(text).toContain("9:00");
  });
});
```

- [ ] **Step 7: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/format.test.ts`
Expected: FAIL — no se puede resolver `@/lib/format`.

- [ ] **Step 8: Implementar `lib/format.ts`**

```ts
const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" });

const dateTime = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

export function formatCLP(amount: number): string {
  return clp.format(amount);
}

export function formatDateTime(date: Date): string {
  return dateTime.format(date);
}
```

- [ ] **Step 9: Ejecutar el test y verificar que pasa**

Run: `npm test -- tests/format.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 10: Ajustar el layout a español**

En `app/layout.tsx`, cambiar `metadata` y el atributo `lang`, sin tocar lo demás:

```tsx
export const metadata: Metadata = {
  title: "SoloTodo Tracker",
  description: "Seguimiento personal de precios en SoloTodo",
};
```

y `<html lang="en"` → `<html lang="es"`.

- [ ] **Step 11: Verificar typecheck y build**

Run: `npm run typecheck && npm run build`
Expected: ambos terminan sin errores.

- [ ] **Step 12: Commit**

```bash
git add -A
git status   # revisar: no debe aparecer .env.local ni node_modules
git commit -m "chore: scaffold Next.js 16 app with Vitest and CLP/date formatting"
```

---

### Task 2: Tipos de dominio y cliente de la API de SoloTodo

**Files:**
- Create: `lib/types.ts`, `lib/solotodo.ts`
- Test: `tests/solotodo.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (`lib/types.ts`):

```ts
export type Params = Record<string, string[]>;
export type TrackedUrlStatus = "ok" | "needs_review";
export type CheckSource = "cron" | "manual";

export interface TrackedUrl {
  id: number;
  url: string;
  label: string;
  categoryId: number | null;
  params: Params;
  status: TrackedUrlStatus;
  active: boolean;
  createdAt: Date;
}

export interface PriceCheck {
  id: number;
  trackedUrlId: number;
  checkedAt: Date;
  source: CheckSource;
  productId: number;
  productName: string;
  productSlug: string;
  normalPrice: number;
  offerPrice: number;
  storeName: string | null;
  storeUrl: string | null;
}

export type NewPriceCheck = Omit<PriceCheck, "id" | "checkedAt">;

export interface BrowseEntry {
  productId: number;
  name: string;
  slug: string;
  normalPrice: number;
  offerPrice: number;
}

export interface StoreOffer {
  storeId: number;
  url: string;
  normalPrice: number;
}

export interface PriceDropAlert {
  label: string;
  productName: string;
  productUrl: string;
  previousPrice: number;
  newPrice: number;
  offerPrice: number;
  storeName: string | null;
  storeUrl: string | null;
}
```

- Produces (`lib/solotodo.ts`):
  - `API_BASE = "https://api.solotodo.com"`
  - `class SolotodoError extends Error`
  - `buildQuery(params: Params, extra?: Record<string, string>): string`
  - `productUrl(productId: number, slug: string): string`
  - `interface SolotodoClient { browse(categoryId: number, params: Params): Promise<BrowseEntry[]>; getAvailableOffers(productId: number): Promise<StoreOffer[]>; getStores(): Promise<Map<number, string>> }`
  - `createSolotodoClient(fetchFn?: typeof fetch): SolotodoClient`
  - `browse` siempre envía `ordering=normal_price_usd`, devuelve la primera página (una entrada por bucket) y `[]` si no hay resultados. Lanza `SolotodoError` ante HTTP no-2xx o forma inesperada.

- [ ] **Step 1: Crear `lib/types.ts`**

Crear el archivo con exactamente el bloque de tipos de "Produces" de arriba.

- [ ] **Step 2: Escribir los tests del cliente que fallan**

Create `tests/solotodo.test.ts`:

```ts
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
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `npm test -- tests/solotodo.test.ts`
Expected: FAIL — no se puede resolver `@/lib/solotodo`.

- [ ] **Step 4: Implementar `lib/solotodo.ts`**

```ts
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
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `npm test -- tests/solotodo.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/solotodo.ts tests/solotodo.test.ts
git commit -m "feat: add domain types and SoloTodo API client"
```

---

### Task 3: Resolución de URLs de solotodo.cl

**Files:**
- Create: `lib/resolve-url.ts`
- Create: `tests/fixtures/solotodo-landing-ssd-m2-pcie-nvme.html`, `tests/fixtures/solotodo-category-ssds.html` (descargados)
- Test: `tests/resolve-url.test.ts`

**Contexto verificado:** las páginas de listado de solotodo.cl traen los datos en chunks `self.__next_f.push([1,"..."])` (strings JSON). Una vez decodificados, contienen `"category":{"id":39,...}` seguido de `"subCategory":{...}` (landing, con `category` y `params` implícitos) o `"subCategory":null` (categoría simple). La home, las fichas de producto y los 404 no tienen `"subCategory":`.

**Interfaces:**
- Consumes: `Params`, `BrowseEntry`, `TrackedUrlStatus` de `lib/types.ts`.
- Produces:
  - `class InvalidUrlError extends Error`
  - `parseSolotodoUrl(raw: string): URL`: lanza `InvalidUrlError` si no es URL http(s), si el host no es `www.solotodo.cl` ni `solotodo.cl`, o si es una ficha `/products/...`
  - `interface LandingConfig { categoryId: number; implicitParams: string }`
  - `extractLandingConfig(html: string): LandingConfig | null`
  - `mergeParams(implicitParams: string, query: URLSearchParams): Params`: la clave de la URL reemplaza completa a la implícita; descarta `ordering`, `page`, `page_size` y valores vacíos
  - `interface ResolvedUrl { url: string; categoryId: number | null; params: Params; status: TrackedUrlStatus }`
  - `interface ResolveDeps { fetchHtml(url: string): Promise<string>; browse(categoryId: number, params: Params): Promise<BrowseEntry[]> }`
  - `resolveUrl(raw: string, deps: ResolveDeps): Promise<ResolvedUrl>`: solo lanza `InvalidUrlError`; cualquier otra falla termina en `needs_review`
  - `fetchPageHtml(url: string, fetchFn?: typeof fetch): Promise<string>`

- [ ] **Step 1: Descargar las fixtures reales**

```bash
mkdir -p tests/fixtures
curl -sSf -A "Mozilla/5.0 (compatible; solotodo-tracker)" -o tests/fixtures/solotodo-landing-ssd-m2-pcie-nvme.html "https://www.solotodo.cl/ssd-m2-pcie-nvme"
curl -sSf -A "Mozilla/5.0 (compatible; solotodo-tracker)" -o tests/fixtures/solotodo-category-ssds.html "https://www.solotodo.cl/unidades_de_estado_solido_ssds"
grep -c '__next_f' tests/fixtures/*.html
```

Expected: ambos archivos pesan ~800 KB y `grep` reporta un número > 0 para cada uno.

- [ ] **Step 2: Escribir los tests que fallan**

Create `tests/resolve-url.test.ts`:

```ts
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
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `npm test -- tests/resolve-url.test.ts`
Expected: FAIL — no se puede resolver `@/lib/resolve-url`.

- [ ] **Step 4: Implementar `lib/resolve-url.ts`**

```ts
import type { BrowseEntry, Params, TrackedUrlStatus } from "./types";

const ALLOWED_HOSTS = new Set(["www.solotodo.cl", "solotodo.cl"]);
const IGNORED_KEYS = new Set(["ordering", "page", "page_size"]);
const FLIGHT_CHUNK = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
const USER_AGENT = "Mozilla/5.0 (compatible; solotodo-tracker)";

export class InvalidUrlError extends Error {}

export interface LandingConfig {
  categoryId: number;
  implicitParams: string;
}

export interface ResolvedUrl {
  url: string;
  categoryId: number | null;
  params: Params;
  status: TrackedUrlStatus;
}

export interface ResolveDeps {
  fetchHtml(url: string): Promise<string>;
  browse(categoryId: number, params: Params): Promise<BrowseEntry[]>;
}

export function parseSolotodoUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new InvalidUrlError("La URL no es válida");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new InvalidUrlError("La URL debe empezar con https://");
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new InvalidUrlError("La URL debe ser de solotodo.cl");
  }
  if (url.pathname.startsWith("/products/")) {
    throw new InvalidUrlError("Solo se pueden seguir listados, no fichas de producto");
  }
  return url;
}

function decodeFlightData(html: string): string {
  let text = "";
  for (const match of html.matchAll(FLIGHT_CHUNK)) {
    try {
      text += JSON.parse(`"${match[1]}"`) as string;
    } catch {
      // chunk no decodificable: se ignora
    }
  }
  return text;
}

export function extractLandingConfig(html: string): LandingConfig | null {
  const text = decodeFlightData(html);
  const subIndex = text.indexOf('"subCategory":');
  if (subIndex === -1) return null;

  const categoryMatches = [...text.slice(0, subIndex).matchAll(/"category":\{"id":(\d+)/g)];
  const lastCategory = categoryMatches.at(-1);
  if (!lastCategory) return null;

  let categoryId = Number(lastCategory[1]);
  let implicitParams = "";
  const sub = text.slice(subIndex).match(/^"subCategory":(\{[^{}]*\})/);
  if (sub) {
    try {
      const parsed = JSON.parse(sub[1]) as { category?: unknown; params?: unknown };
      if (typeof parsed.category === "number") categoryId = parsed.category;
      if (typeof parsed.params === "string") implicitParams = parsed.params;
    } catch {
      // subCategory ilegible: se usa solo la categoría de la página
    }
  }
  return { categoryId, implicitParams };
}

function toParams(source: URLSearchParams): Params {
  const params: Params = {};
  for (const [key, value] of source) {
    if (IGNORED_KEYS.has(key) || value === "") continue;
    (params[key] ??= []).push(value);
  }
  return params;
}

export function mergeParams(implicitParams: string, query: URLSearchParams): Params {
  return { ...toParams(new URLSearchParams(implicitParams)), ...toParams(query) };
}

export async function fetchPageHtml(url: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const response = await fetchFn(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GET ${url} respondió ${response.status}`);
  return response.text();
}

export async function resolveUrl(raw: string, deps: ResolveDeps): Promise<ResolvedUrl> {
  const url = parseSolotodoUrl(raw);
  const normalized = url.toString();

  let config: LandingConfig | null = null;
  try {
    config = extractLandingConfig(await deps.fetchHtml(normalized));
  } catch {
    config = null;
  }

  const params = mergeParams(config?.implicitParams ?? "", url.searchParams);
  if (!config) return { url: normalized, categoryId: null, params, status: "needs_review" };

  try {
    const entries = await deps.browse(config.categoryId, params);
    return {
      url: normalized,
      categoryId: config.categoryId,
      params,
      status: entries.length > 0 ? "ok" : "needs_review",
    };
  } catch {
    return { url: normalized, categoryId: config.categoryId, params, status: "needs_review" };
  }
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `npm test -- tests/resolve-url.test.ts`
Expected: PASS. Si falla alguno de `extractLandingConfig` con las fixtures, abrir la fixture, buscar `subCategory` y revisar que la estructura siga siendo la descrita en "Contexto verificado". No cambiar las expectativas de categoría 39 ni de los params implícitos sin confirmar en el sitio.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add lib/resolve-url.ts tests/resolve-url.test.ts tests/fixtures
git commit -m "feat: resolve solotodo.cl listing URLs to API category and params"
```

---

### Task 4: Lógica de chequeo de precios

**Files:**
- Create: `lib/check-prices.ts`
- Test: `tests/check-prices.test.ts`

**Interfaces:**
- Consumes: tipos de `lib/types.ts`; `SolotodoClient` y `productUrl` de `lib/solotodo.ts`.
- Produces:

```ts
export interface PriceRepo {
  listCheckableUrls(): Promise<TrackedUrl[]>;        // active = true AND status = 'ok'
  getTrackedUrl(id: number): Promise<TrackedUrl | null>;
  getLastCheck(trackedUrlId: number): Promise<PriceCheck | null>;
  insertCheck(check: NewPriceCheck): Promise<PriceCheck>;
}

export interface CheckDeps {
  repo: PriceRepo;
  solotodo: SolotodoClient;
  sendAlert(alert: PriceDropAlert): Promise<void>;
  logError(message: string, error: unknown): void;
}

export interface CheckOptions { source: CheckSource; trackedUrlId?: number }
export interface CheckSummary { checked: number; failed: number; alerts: number }

export function checkPrices(deps: CheckDeps, options: CheckOptions): Promise<CheckSummary>;
```

Reglas (de la spec): con `trackedUrlId` se procesa solo esa URL si tiene `status: "ok"` (aunque esté pausada); sin él, `repo.listCheckableUrls()`. Se toma el menor `normalPrice` de la página. La tienda sale de la oferta disponible más barata (en empate, la primera) y `getStores` se llama como máximo una vez por ejecución; cualquier falla deja la tienda en null. El registro se inserta siempre que `browse` haya funcionado y traiga resultados. Se envía email solo si `source === "cron"`, existe un registro previo y el nuevo `normalPrice` es menor. Si el email falla, se loguea y `checkPrices` no lanza.

- [ ] **Step 1: Escribir los tests que fallan**

Create `tests/check-prices.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { checkPrices, type CheckDeps, type PriceRepo } from "@/lib/check-prices";
import type { SolotodoClient } from "@/lib/solotodo";
import type { BrowseEntry, PriceCheck, StoreOffer, TrackedUrl } from "@/lib/types";

function tracked(overrides: Partial<TrackedUrl> = {}): TrackedUrl {
  return {
    id: 1,
    url: "https://www.solotodo.cl/ssd-m2-pcie-nvme",
    label: "SSD 2TB",
    categoryId: 39,
    params: { base_buses: ["1559281"] },
    status: "ok",
    active: true,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

function entry(overrides: Partial<BrowseEntry> = {}): BrowseEntry {
  return {
    productId: 127681,
    name: "A-DATA XPG Gammix S70 BLADE 2 TB",
    slug: "a-data-xpg-gammix-s70-blade-2-tb",
    normalPrice: 400889,
    offerPrice: 379990,
    ...overrides,
  };
}

function previousCheck(overrides: Partial<PriceCheck> = {}): PriceCheck {
  return {
    id: 100,
    trackedUrlId: 1,
    checkedAt: new Date("2026-09-27T12:00:00Z"),
    source: "cron",
    productId: 127681,
    productName: "A-DATA XPG Gammix S70 BLADE 2 TB",
    productSlug: "a-data-xpg-gammix-s70-blade-2-tb",
    normalPrice: 420000,
    offerPrice: 399990,
    storeName: "MyShop",
    storeUrl: "https://myshop.cl/p",
    ...overrides,
  };
}

function makeRepo(urls: TrackedUrl[], checks: PriceCheck[]): PriceRepo & { checks: PriceCheck[] } {
  let nextId = 1000;
  return {
    checks,
    async listCheckableUrls() {
      return urls.filter((u) => u.active && u.status === "ok");
    },
    async getTrackedUrl(id) {
      return urls.find((u) => u.id === id) ?? null;
    },
    async getLastCheck(trackedUrlId) {
      return checks.filter((c) => c.trackedUrlId === trackedUrlId).at(-1) ?? null;
    },
    async insertCheck(check) {
      const saved: PriceCheck = { ...check, id: nextId++, checkedAt: new Date() };
      checks.push(saved);
      return saved;
    },
  };
}

interface SetupOptions {
  urls?: TrackedUrl[];
  checks?: PriceCheck[];
  entries?: BrowseEntry[];
  offers?: StoreOffer[];
  stores?: Map<number, string>;
}

function setup(options: SetupOptions = {}) {
  const repo = makeRepo(options.urls ?? [tracked()], options.checks ?? []);
  const solotodo = {
    browse: vi.fn<SolotodoClient["browse"]>(async () => options.entries ?? [entry()]),
    getAvailableOffers: vi.fn<SolotodoClient["getAvailableOffers"]>(
      async () =>
        options.offers ?? [{ storeId: 5144, url: "https://myshop.cl/p26990", normalPrice: 400889 }],
    ),
    getStores: vi.fn<SolotodoClient["getStores"]>(
      async () => options.stores ?? new Map([[5144, "MyShop"], [34, "PC Express"]]),
    ),
  };
  const sendAlert = vi.fn<CheckDeps["sendAlert"]>(async () => {});
  const logError = vi.fn<CheckDeps["logError"]>();
  const deps: CheckDeps = { repo, solotodo, sendAlert, logError };
  return { deps, repo, solotodo, sendAlert, logError };
}

describe("checkPrices: comparación y alertas", () => {
  it("cron + baja de precio: inserta el registro y envía el email", async () => {
    const { deps, repo, sendAlert } = setup({ checks: [previousCheck({ normalPrice: 420000 })] });

    const summary = await checkPrices(deps, { source: "cron" });

    expect(summary).toEqual({ checked: 1, failed: 0, alerts: 1 });
    expect(repo.checks.at(-1)).toMatchObject({
      trackedUrlId: 1,
      source: "cron",
      productId: 127681,
      normalPrice: 400889,
      offerPrice: 379990,
      storeName: "MyShop",
      storeUrl: "https://myshop.cl/p26990",
    });
    expect(sendAlert).toHaveBeenCalledWith({
      label: "SSD 2TB",
      productName: "A-DATA XPG Gammix S70 BLADE 2 TB",
      productUrl: "https://www.solotodo.cl/products/127681-a-data-xpg-gammix-s70-blade-2-tb",
      previousPrice: 420000,
      newPrice: 400889,
      offerPrice: 379990,
      storeName: "MyShop",
      storeUrl: "https://myshop.cl/p26990",
    });
  });

  it("cron + precio mayor: inserta sin email", async () => {
    const { deps, repo, sendAlert } = setup({ checks: [previousCheck({ normalPrice: 390000 })] });
    const summary = await checkPrices(deps, { source: "cron" });
    expect(summary).toEqual({ checked: 1, failed: 0, alerts: 0 });
    expect(repo.checks).toHaveLength(2);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("cron + mismo precio: inserta sin email", async () => {
    const { deps, repo, sendAlert } = setup({ checks: [previousCheck({ normalPrice: 400889 })] });
    await checkPrices(deps, { source: "cron" });
    expect(repo.checks).toHaveLength(2);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("primer chequeo de una URL: inserta sin email", async () => {
    const { deps, repo, sendAlert } = setup({ checks: [] });
    await checkPrices(deps, { source: "cron" });
    expect(repo.checks).toHaveLength(1);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("manual + baja de precio: inserta con source manual y nunca envía email", async () => {
    const { deps, repo, sendAlert } = setup({ checks: [previousCheck({ normalPrice: 420000 })] });
    const summary = await checkPrices(deps, { source: "manual", trackedUrlId: 1 });
    expect(summary).toEqual({ checked: 1, failed: 0, alerts: 0 });
    expect(repo.checks.at(-1)?.source).toBe("manual");
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("un refresh manual que ya vio la baja hace que el cron siguiente no envíe email", async () => {
    const { deps, sendAlert } = setup({ checks: [previousCheck({ normalPrice: 420000 })] });
    await checkPrices(deps, { source: "manual", trackedUrlId: 1 });
    await checkPrices(deps, { source: "cron" });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("si cambia el producto más barato y el precio baja, cuenta como baja", async () => {
    const { deps, sendAlert } = setup({
      checks: [previousCheck({ normalPrice: 420000 })],
      entries: [entry({ productId: 999, name: "Kingston NV3 2 TB", slug: "kingston-nv3", normalPrice: 300000 })],
    });
    await checkPrices(deps, { source: "cron" });
    expect(sendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        productName: "Kingston NV3 2 TB",
        productUrl: "https://www.solotodo.cl/products/999-kingston-nv3",
        previousPrice: 420000,
        newPrice: 300000,
      }),
    );
  });

  it("elige el menor normal_price aunque la página venga desordenada", async () => {
    const { deps, repo } = setup({
      entries: [
        entry({ productId: 1, normalPrice: 500000 }),
        entry({ productId: 2, normalPrice: 350000 }),
        entry({ productId: 3, normalPrice: 450000 }),
      ],
    });
    await checkPrices(deps, { source: "cron" });
    expect(repo.checks.at(-1)).toMatchObject({ productId: 2, normalPrice: 350000 });
  });
});

describe("checkPrices: tienda informativa", () => {
  it("elige la oferta disponible más barata y, en empate, la primera", async () => {
    const { deps, repo } = setup({
      offers: [
        { storeId: 34, url: "https://pcexpress.cl/p", normalPrice: 410000 },
        { storeId: 5144, url: "https://myshop.cl/p", normalPrice: 400889 },
        { storeId: 34, url: "https://pcexpress.cl/p2", normalPrice: 400889 },
      ],
    });
    await checkPrices(deps, { source: "cron" });
    expect(repo.checks.at(-1)).toMatchObject({ storeName: "MyShop", storeUrl: "https://myshop.cl/p" });
  });

  it("sin ofertas disponibles: tienda null y registro insertado", async () => {
    const { deps, repo } = setup({ offers: [] });
    const summary = await checkPrices(deps, { source: "cron" });
    expect(summary.checked).toBe(1);
    expect(repo.checks.at(-1)).toMatchObject({ storeName: null, storeUrl: null });
  });

  it("si falla la consulta de ofertas: tienda null, se loguea, y la alerta se envía igual", async () => {
    const { deps, repo, solotodo, sendAlert, logError } = setup({
      checks: [previousCheck({ normalPrice: 420000 })],
    });
    solotodo.getAvailableOffers.mockRejectedValueOnce(new Error("timeout"));
    const summary = await checkPrices(deps, { source: "cron" });
    expect(summary).toEqual({ checked: 1, failed: 0, alerts: 1 });
    expect(repo.checks.at(-1)).toMatchObject({ storeName: null, storeUrl: null });
    expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({ storeName: null, storeUrl: null }));
    expect(logError).toHaveBeenCalled();
  });

  it("si falla la lista de tiendas: tienda null y registro insertado", async () => {
    const { deps, repo, solotodo } = setup();
    solotodo.getStores.mockRejectedValueOnce(new Error("500"));
    await checkPrices(deps, { source: "cron" });
    expect(repo.checks.at(-1)).toMatchObject({ storeName: null, storeUrl: null });
  });

  it("pide la lista de tiendas una sola vez por ejecución", async () => {
    const { deps, solotodo } = setup({ urls: [tracked({ id: 1 }), tracked({ id: 2, label: "Otro" })] });
    await checkPrices(deps, { source: "cron" });
    expect(solotodo.getStores).toHaveBeenCalledTimes(1);
  });
});

describe("checkPrices: errores y selección de URLs", () => {
  it("0 resultados: no inserta, cuenta como fallo y loguea", async () => {
    const { deps, repo, logError } = setup({ entries: [] });
    const summary = await checkPrices(deps, { source: "cron" });
    expect(summary).toEqual({ checked: 0, failed: 1, alerts: 0 });
    expect(repo.checks).toHaveLength(0);
    expect(logError).toHaveBeenCalled();
  });

  it("un fallo en una URL no bloquea las demás", async () => {
    const { deps, repo, solotodo } = setup({
      urls: [tracked({ id: 1, label: "Rota" }), tracked({ id: 2, label: "Sana" })],
    });
    solotodo.browse.mockRejectedValueOnce(new Error("500"));
    const summary = await checkPrices(deps, { source: "cron" });
    expect(summary).toEqual({ checked: 1, failed: 1, alerts: 0 });
    expect(repo.checks.map((c) => c.trackedUrlId)).toEqual([2]);
  });

  it("si el email falla: el registro queda, se loguea y no lanza", async () => {
    const { deps, repo, sendAlert, logError } = setup({
      checks: [previousCheck({ normalPrice: 420000 })],
    });
    sendAlert.mockRejectedValueOnce(new Error("resend down"));
    const summary = await checkPrices(deps, { source: "cron" });
    expect(summary).toEqual({ checked: 1, failed: 0, alerts: 0 });
    expect(repo.checks).toHaveLength(2);
    expect(logError).toHaveBeenCalled();
  });

  it("con trackedUrlId procesa solo esa URL, aunque esté pausada", async () => {
    const { deps, repo, solotodo } = setup({
      urls: [tracked({ id: 1, active: false }), tracked({ id: 2 })],
    });
    const summary = await checkPrices(deps, { source: "manual", trackedUrlId: 1 });
    expect(summary.checked).toBe(1);
    expect(solotodo.browse).toHaveBeenCalledTimes(1);
    expect(repo.checks.map((c) => c.trackedUrlId)).toEqual([1]);
  });

  it("con trackedUrlId en needs_review o inexistente no procesa nada", async () => {
    const { deps, solotodo } = setup({
      urls: [tracked({ id: 1, status: "needs_review", categoryId: null })],
    });
    await expect(checkPrices(deps, { source: "manual", trackedUrlId: 1 })).resolves.toEqual({
      checked: 0,
      failed: 0,
      alerts: 0,
    });
    await expect(checkPrices(deps, { source: "manual", trackedUrlId: 42 })).resolves.toEqual({
      checked: 0,
      failed: 0,
      alerts: 0,
    });
    expect(solotodo.browse).not.toHaveBeenCalled();
  });

  it("sin trackedUrlId usa solo las URLs chequeables del repo", async () => {
    const { deps, solotodo } = setup({
      urls: [tracked({ id: 1, active: false }), tracked({ id: 2, status: "needs_review" }), tracked({ id: 3 })],
    });
    await checkPrices(deps, { source: "cron" });
    expect(solotodo.browse).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test -- tests/check-prices.test.ts`
Expected: FAIL — no se puede resolver `@/lib/check-prices`.

- [ ] **Step 3: Implementar `lib/check-prices.ts`**

```ts
import { productUrl, type SolotodoClient } from "./solotodo";
import type {
  BrowseEntry,
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
  insertCheck(check: NewPriceCheck): Promise<PriceCheck>;
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

  const cheapest: BrowseEntry | null = cheapestBy(
    await deps.solotodo.browse(tracked.categoryId, tracked.params),
  );
  if (!cheapest) throw new Error("El listado no devolvió resultados");

  const store = await findStore(deps, cheapest.productId, getStores);
  const previous = await deps.repo.getLastCheck(tracked.id);
  const check = await deps.repo.insertCheck({
    trackedUrlId: tracked.id,
    source,
    productId: cheapest.productId,
    productName: cheapest.name,
    productSlug: cheapest.slug,
    normalPrice: cheapest.normalPrice,
    offerPrice: cheapest.offerPrice,
    storeName: store.name,
    storeUrl: store.url,
  });

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
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test -- tests/check-prices.test.ts`
Expected: PASS (19 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/check-prices.ts tests/check-prices.test.ts
git commit -m "feat: add price check logic with cron-only drop alerts"
```

---

### Task 5: Email de alerta con Resend

**Files:**
- Create: `lib/email.ts`
- Test: `tests/email.test.ts`

**Interfaces:**
- Consumes: `PriceDropAlert` (`lib/types.ts`), `formatCLP` (`lib/format.ts`).
- Produces:
  - `DEFAULT_ALERT_FROM = "SoloTodo Tracker <onboarding@resend.dev>"`
  - `interface EmailMessage { subject: string; html: string; text: string }`
  - `buildAlertEmail(alert: PriceDropAlert): EmailMessage`
  - `interface ResendLike { emails: { send(payload: { from: string; to: string; subject: string; html: string; text: string }): Promise<{ error: { message: string } | null }> } }`
  - `createAlertSender(resend: ResendLike, config: { to: string; from: string }): (alert: PriceDropAlert) => Promise<void>`: lanza si Resend devuelve `error`

- [ ] **Step 1: Escribir los tests que fallan**

Create `tests/email.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildAlertEmail, createAlertSender, type ResendLike } from "@/lib/email";
import type { PriceDropAlert } from "@/lib/types";

const ALERT: PriceDropAlert = {
  label: "SSD 2TB",
  productName: "A-DATA XPG Gammix S70 BLADE 2 TB",
  productUrl: "https://www.solotodo.cl/products/127681-a-data-xpg",
  previousPrice: 420000,
  newPrice: 400889,
  offerPrice: 379990,
  storeName: "MyShop",
  storeUrl: "https://myshop.cl/p26990",
};

describe("buildAlertEmail", () => {
  it("incluye label, producto, precios y tienda", () => {
    const email = buildAlertEmail(ALERT);
    expect(email.subject).toBe("Bajó de precio: SSD 2TB · $400.889");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("SSD 2TB");
      expect(part).toContain("A-DATA XPG Gammix S70 BLADE 2 TB");
      expect(part).toContain("$420.000");
      expect(part).toContain("$400.889");
      expect(part).toContain("$379.990");
      expect(part).toContain("MyShop");
      expect(part).toContain("https://www.solotodo.cl/products/127681-a-data-xpg");
    }
    expect(email.html).toContain('<a href="https://myshop.cl/p26990">MyShop</a>');
  });

  it("omite la tienda cuando no hay", () => {
    const email = buildAlertEmail({ ...ALERT, storeName: null, storeUrl: null });
    expect(email.html).not.toContain("Tienda");
    expect(email.text).not.toContain("Tienda");
  });

  it("escapa HTML en textos del usuario y de SoloTodo", () => {
    const email = buildAlertEmail({ ...ALERT, label: "SSD <b>&</b>", productName: 'Disco "X" <script>' });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("SSD &lt;b&gt;&amp;&lt;/b&gt;");
    expect(email.html).toContain("Disco &quot;X&quot; &lt;script&gt;");
  });
});

describe("createAlertSender", () => {
  function fakeResend(result: { error: { message: string } | null }) {
    const send = vi.fn<ResendLike["emails"]["send"]>(async () => result);
    return { resend: { emails: { send } } satisfies ResendLike, send };
  }

  it("envía con from/to configurados", async () => {
    const { resend, send } = fakeResend({ error: null });
    await createAlertSender(resend, { to: "hola@narce.cl", from: "Tracker <a@b.cl>" })(ALERT);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Tracker <a@b.cl>",
        to: "hola@narce.cl",
        subject: "Bajó de precio: SSD 2TB · $400.889",
      }),
    );
  });

  it("lanza si Resend devuelve error sin lanzar", async () => {
    const { resend } = fakeResend({ error: { message: "domain not verified" } });
    await expect(
      createAlertSender(resend, { to: "hola@narce.cl", from: "x@y.cl" })(ALERT),
    ).rejects.toThrow("domain not verified");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test -- tests/email.test.ts`
Expected: FAIL — no se puede resolver `@/lib/email`.

- [ ] **Step 3: Implementar `lib/email.ts`**

```ts
import { formatCLP } from "./format";
import type { PriceDropAlert } from "./types";

export const DEFAULT_ALERT_FROM = "SoloTodo Tracker <onboarding@resend.dev>";

export interface EmailMessage {
  subject: string;
  html: string;
  text: string;
}

export interface ResendLike {
  emails: {
    send(payload: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    }): Promise<{ error: { message: string } | null }>;
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildAlertEmail(alert: PriceDropAlert): EmailMessage {
  const previous = formatCLP(alert.previousPrice);
  const current = formatCLP(alert.newPrice);
  const offer = formatCLP(alert.offerPrice);

  const htmlLines = [
    `<p><strong>${escapeHtml(alert.label)}</strong></p>`,
    `<p><a href="${escapeHtml(alert.productUrl)}">${escapeHtml(alert.productName)}</a></p>`,
    `<p>Precio normal: <s>${previous}</s> → <strong>${current}</strong></p>`,
    `<p>Precio con medio de pago específico: ${offer}</p>`,
  ];
  const textLines = [
    alert.label,
    alert.productName,
    `Precio normal: ${previous} → ${current}`,
    `Precio con medio de pago específico: ${offer}`,
    `Ficha en SoloTodo: ${alert.productUrl}`,
  ];

  if (alert.storeName) {
    const name = escapeHtml(alert.storeName);
    htmlLines.push(
      `<p>Tienda: ${alert.storeUrl ? `<a href="${escapeHtml(alert.storeUrl)}">${name}</a>` : name}</p>`,
    );
    textLines.push(`Tienda: ${alert.storeName}${alert.storeUrl ? ` (${alert.storeUrl})` : ""}`);
  }

  return {
    subject: `Bajó de precio: ${alert.label} · ${current}`,
    html: htmlLines.join("\n"),
    text: textLines.join("\n"),
  };
}

export function createAlertSender(resend: ResendLike, config: { to: string; from: string }) {
  return async function sendAlert(alert: PriceDropAlert): Promise<void> {
    const { error } = await resend.emails.send({
      from: config.from,
      to: config.to,
      ...buildAlertEmail(alert),
    });
    if (error) throw new Error(`Resend rechazó el envío: ${error.message}`);
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test -- tests/email.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck y commit**

Run: `npm run typecheck`
Expected: sin errores.

```bash
git add lib/email.ts tests/email.test.ts
git commit -m "feat: add price drop alert email via Resend"
```

---

### Task 6: Base de datos (Drizzle + Neon)

**Files:**
- Create: `lib/db/schema.ts`, `lib/db/index.ts`, `lib/db/repo.ts`, `drizzle.config.ts`
- Create (generado): `drizzle/0000_*.sql`, `drizzle/meta/*`

**Interfaces:**
- Consumes: tipos de `lib/types.ts`, `PriceRepo` de `lib/check-prices.ts`.
- Produces:
  - `getDb()`: cliente Drizzle perezoso (lee `DATABASE_URL` en la primera llamada, no al importar)
  - `priceRepo: PriceRepo`
  - `listTrackedUrls(): Promise<TrackedUrl[]>` (orden por `id`)
  - `listAllChecks(): Promise<PriceCheck[]>` (orden por `checkedAt`, `id` ascendente)
  - `createTrackedUrl(input: { url: string; label: string; categoryId: number | null; params: Params; status: TrackedUrlStatus }): Promise<TrackedUrl>`
  - `setTrackedUrlActive(id: number, active: boolean): Promise<TrackedUrl | null>`
  - `deleteTrackedUrl(id: number): Promise<boolean>`

Este módulo es una capa delgada sobre Drizzle y no tiene unit tests (la spec limita los tests a la lógica). Se valida con la migración real acá y con el flujo completo en las Tasks 7 y 9.

- [ ] **Step 1: Obtener `DATABASE_URL`**

Pedirle al usuario la connection string de su proyecto Neon: dashboard de Neon → Connect → connection string "pooled". Si no tiene proyecto, que cree uno gratis en neon.tech. Crear `.env.local` (no se commitea) copiando `.env.example` y completando `DATABASE_URL`. Las demás variables pueden quedar vacías por ahora.

- [ ] **Step 2: Crear el schema**

Create `lib/db/schema.ts`:

```ts
import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { Params } from "../types";

export const trackedUrls = pgTable("tracked_urls", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  label: text("label").notNull(),
  categoryId: integer("category_id"),
  params: jsonb("params").$type<Params>().notNull().default({}),
  status: text("status", { enum: ["ok", "needs_review"] }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const priceChecks = pgTable(
  "price_checks",
  {
    id: serial("id").primaryKey(),
    trackedUrlId: integer("tracked_url_id")
      .notNull()
      .references(() => trackedUrls.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source", { enum: ["cron", "manual"] }).notNull(),
    productId: integer("product_id").notNull(),
    productName: text("product_name").notNull(),
    productSlug: text("product_slug").notNull(),
    normalPrice: integer("normal_price").notNull(),
    offerPrice: integer("offer_price").notNull(),
    storeName: text("store_name"),
    storeUrl: text("store_url"),
  },
  (table) => [index("price_checks_tracked_url_checked_at_idx").on(table.trackedUrlId, table.checkedAt)],
);
```

- [ ] **Step 3: Crear el cliente perezoso**

Create `lib/db/index.ts`:

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let db: NeonHttpDatabase<typeof schema> | null = null;

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta la variable de entorno DATABASE_URL");
    db = drizzle({ client: neon(url), schema });
  }
  return db;
}
```

- [ ] **Step 4: Crear el repositorio**

Create `lib/db/repo.ts`:

```ts
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
```

- [ ] **Step 5: Configurar drizzle-kit**

Create `drizzle.config.ts`. Usa `process.loadEnvFile` (nativo en Node 24) para leer `.env.local`:

```ts
import { defineConfig } from "drizzle-kit";

process.loadEnvFile(".env.local");

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 6: Generar y revisar la migración**

Run: `npm run db:generate`
Expected: crea `drizzle/0000_<nombre>.sql` con `CREATE TABLE "tracked_urls"`, `CREATE TABLE "price_checks"`, la FK con `ON DELETE cascade` y el índice `price_checks_tracked_url_checked_at_idx`. Leer el SQL y confirmar que las columnas coinciden con la tabla del spec.

- [ ] **Step 7: Aplicar la migración a Neon**

Run: `npm run db:migrate`
Expected: termina sin error. Confirmar en el SQL Editor de Neon, o pidiéndoselo al usuario, que existen las tablas `tracked_urls` y `price_checks`.

- [ ] **Step 8: Typecheck y tests**

Run: `npm run typecheck && npm test`
Expected: sin errores; todos los tests previos siguen pasando.

- [ ] **Step 9: Commit**

```bash
git add lib/db drizzle drizzle.config.ts
git status   # confirmar que .env.local NO está staged
git commit -m "feat: add Drizzle schema, Neon client and repository"
```

---

### Task 7: Cableado: rutas API y script del cron local

**Files:**
- Create: `lib/deps.ts`, `app/api/check-prices/route.ts`, `app/api/tracked-urls/route.ts`, `app/api/tracked-urls/[id]/route.ts`, `scripts/check-prices.ts`
- Test: `tests/api-check-prices.test.ts`, `tests/api-tracked-urls.test.ts`

**Interfaces:**
- Consumes: `checkPrices`, `CheckDeps` (Task 4); `createSolotodoClient` (Task 2); `resolveUrl`, `fetchPageHtml`, `InvalidUrlError` (Task 3); `createAlertSender`, `DEFAULT_ALERT_FROM` (Task 5); `priceRepo`, `createTrackedUrl`, `setTrackedUrlActive`, `deleteTrackedUrl` (Task 6).
- Produces:
  - `createCheckDeps(): CheckDeps`. Resend se instancia recién al enviar, así el refresh manual funciona aunque falte `RESEND_API_KEY`.
  - `GET /api/check-prices`: requiere `Authorization: Bearer ${CRON_SECRET}`. 401 si falta, no coincide o `CRON_SECRET` no está definido. 200 con `CheckSummary`.
  - `POST /api/check-prices` con body `{ trackedUrlId: number }`: 400 si el id es inválido. 200 con `CheckSummary` si `checked === 1`; si no, 502 `{ error }`.
  - `POST /api/tracked-urls` con body `{ url: string, label: string }`: 400 `{ error }` si el label está vacío o la URL es inválida. 201 con el `TrackedUrl` creado (su `status` indica `ok` o `needs_review`).
  - `PATCH /api/tracked-urls/[id]` con body `{ active: boolean }`: 400 si el body es inválido, 404 si no existe, 200 con el `TrackedUrl`.
  - `DELETE /api/tracked-urls/[id]`: 204, o 404 si no existe.
  - `npm run check-prices`: ejecuta `checkPrices({ source: "cron" })` leyendo `.env.local`; sale con código 1 si algún chequeo falló.

- [ ] **Step 1: Leer la documentación de route handlers de Next 16**

Leer `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` y `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (sección `RouteContext`).

- [ ] **Step 2: Escribir los tests de `/api/check-prices` que fallan**

Create `tests/api-check-prices.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/deps", () => ({ createCheckDeps: vi.fn(() => ({ fake: true })) }));
vi.mock("@/lib/check-prices", () => ({ checkPrices: vi.fn() }));

import { GET, POST } from "@/app/api/check-prices/route";
import { checkPrices } from "@/lib/check-prices";

const mockedCheckPrices = vi.mocked(checkPrices);
const URL_ = "http://localhost/api/check-prices";

beforeEach(() => {
  mockedCheckPrices.mockReset();
  mockedCheckPrices.mockResolvedValue({ checked: 1, failed: 0, alerts: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/check-prices (cron)", () => {
  it("401 sin header de autorización", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await GET(new Request(URL_));
    expect(res.status).toBe(401);
    expect(mockedCheckPrices).not.toHaveBeenCalled();
  });

  it("401 con secreto incorrecto", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await GET(new Request(URL_, { headers: { Authorization: "Bearer otro" } }));
    expect(res.status).toBe(401);
  });

  it("401 si CRON_SECRET no está configurado", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(new Request(URL_, { headers: { Authorization: "Bearer " } }));
    expect(res.status).toBe(401);
    expect(mockedCheckPrices).not.toHaveBeenCalled();
  });

  it("200 y ejecuta con source cron cuando el secreto coincide", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await GET(new Request(URL_, { headers: { Authorization: "Bearer s3cret" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 1, failed: 0, alerts: 0 });
    expect(mockedCheckPrices).toHaveBeenCalledWith({ fake: true }, { source: "cron" });
  });
});

describe("POST /api/check-prices (manual)", () => {
  const post = (body: unknown) =>
    POST(new Request(URL_, { method: "POST", body: JSON.stringify(body) }));

  it.each([{}, { trackedUrlId: "1" }, { trackedUrlId: 0 }, { trackedUrlId: 1.5 }])(
    "400 con body inválido %j",
    async (body) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(mockedCheckPrices).not.toHaveBeenCalled();
    },
  );

  it("ejecuta con source manual para esa URL", async () => {
    const res = await post({ trackedUrlId: 7 });
    expect(res.status).toBe(200);
    expect(mockedCheckPrices).toHaveBeenCalledWith(
      { fake: true },
      { source: "manual", trackedUrlId: 7 },
    );
  });

  it("502 si no se pudo chequear", async () => {
    mockedCheckPrices.mockResolvedValue({ checked: 0, failed: 1, alerts: 0 });
    const res = await post({ trackedUrlId: 7 });
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 3: Escribir los tests de `/api/tracked-urls` que fallan**

Create `tests/api-tracked-urls.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackedUrl } from "@/lib/types";

vi.mock("@/lib/db/repo", () => ({
  createTrackedUrl: vi.fn(),
  setTrackedUrlActive: vi.fn(),
  deleteTrackedUrl: vi.fn(),
}));
vi.mock("@/lib/resolve-url", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resolve-url")>()),
  resolveUrl: vi.fn(),
}));

import { POST } from "@/app/api/tracked-urls/route";
import { DELETE, PATCH } from "@/app/api/tracked-urls/[id]/route";
import { createTrackedUrl, deleteTrackedUrl, setTrackedUrlActive } from "@/lib/db/repo";
import { InvalidUrlError, resolveUrl } from "@/lib/resolve-url";

const ROW: TrackedUrl = {
  id: 1,
  url: "https://www.solotodo.cl/ssd-m2-pcie-nvme",
  label: "SSD 2TB",
  categoryId: 39,
  params: {},
  status: "ok",
  active: true,
  createdAt: new Date("2026-09-28T00:00:00Z"),
};

const json = (method: string, body: unknown) =>
  new Request("http://localhost/api/tracked-urls", { method, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.mocked(resolveUrl).mockReset();
  vi.mocked(createTrackedUrl).mockReset();
  vi.mocked(setTrackedUrlActive).mockReset();
  vi.mocked(deleteTrackedUrl).mockReset();
});

describe("POST /api/tracked-urls", () => {
  it("400 si el nombre está vacío", async () => {
    const res = await POST(json("POST", { url: ROW.url, label: "   " }));
    expect(res.status).toBe(400);
    expect(resolveUrl).not.toHaveBeenCalled();
  });

  it("400 con el mensaje de InvalidUrlError", async () => {
    vi.mocked(resolveUrl).mockRejectedValue(new InvalidUrlError("La URL debe ser de solotodo.cl"));
    const res = await POST(json("POST", { url: "https://evil.com", label: "X" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "La URL debe ser de solotodo.cl" });
  });

  it("201 guarda la URL resuelta con el label recortado", async () => {
    vi.mocked(resolveUrl).mockResolvedValue({
      url: ROW.url,
      categoryId: 39,
      params: { bus: ["1"] },
      status: "needs_review",
    });
    vi.mocked(createTrackedUrl).mockResolvedValue({ ...ROW, status: "needs_review" });
    const res = await POST(json("POST", { url: ROW.url, label: "  SSD 2TB " }));
    expect(res.status).toBe(201);
    expect(createTrackedUrl).toHaveBeenCalledWith({
      url: ROW.url,
      label: "SSD 2TB",
      categoryId: 39,
      params: { bus: ["1"] },
      status: "needs_review",
    });
    expect((await res.json()).status).toBe("needs_review");
  });
});

describe("PATCH /api/tracked-urls/[id]", () => {
  it("400 si active no es boolean", async () => {
    const res = await PATCH(json("PATCH", { active: "no" }), ctx("1"));
    expect(res.status).toBe(400);
  });

  it("404 con id inválido o inexistente", async () => {
    expect((await PATCH(json("PATCH", { active: false }), ctx("abc"))).status).toBe(404);
    vi.mocked(setTrackedUrlActive).mockResolvedValue(null);
    expect((await PATCH(json("PATCH", { active: false }), ctx("99"))).status).toBe(404);
  });

  it("200 actualiza active", async () => {
    vi.mocked(setTrackedUrlActive).mockResolvedValue({ ...ROW, active: false });
    const res = await PATCH(json("PATCH", { active: false }), ctx("1"));
    expect(res.status).toBe(200);
    expect(setTrackedUrlActive).toHaveBeenCalledWith(1, false);
  });
});

describe("DELETE /api/tracked-urls/[id]", () => {
  it("204 si borra, 404 si no existe", async () => {
    vi.mocked(deleteTrackedUrl).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await DELETE(json("DELETE", null), ctx("1"))).status).toBe(204);
    expect((await DELETE(json("DELETE", null), ctx("2"))).status).toBe(404);
  });
});
```

- [ ] **Step 4: Ejecutar y verificar que fallan**

Run: `npm test -- tests/api-check-prices.test.ts tests/api-tracked-urls.test.ts`
Expected: FAIL — no se pueden resolver los módulos de `app/api/...`.

- [ ] **Step 5: Implementar `lib/deps.ts`**

```ts
import { Resend } from "resend";
import type { CheckDeps } from "./check-prices";
import { priceRepo } from "./db/repo";
import { DEFAULT_ALERT_FROM, createAlertSender } from "./email";
import { createSolotodoClient } from "./solotodo";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export function createCheckDeps(): CheckDeps {
  return {
    repo: priceRepo,
    solotodo: createSolotodoClient(),
    sendAlert: (alert) =>
      createAlertSender(new Resend(requireEnv("RESEND_API_KEY")), {
        to: requireEnv("ALERT_EMAIL"),
        from: process.env.ALERT_FROM || DEFAULT_ALERT_FROM,
      })(alert),
    logError: (message, error) => console.error(`[check-prices] ${message}:`, error),
  };
}
```

- [ ] **Step 6: Implementar `app/api/check-prices/route.ts`**

```ts
import { checkPrices } from "@/lib/check-prices";
import { createCheckDeps } from "@/lib/deps";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const summary = await checkPrices(createCheckDeps(), { source: "cron" });
  return Response.json(summary);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { trackedUrlId?: unknown } | null;
  const trackedUrlId = body?.trackedUrlId;
  if (typeof trackedUrlId !== "number" || !Number.isInteger(trackedUrlId) || trackedUrlId <= 0) {
    return Response.json({ error: "trackedUrlId inválido" }, { status: 400 });
  }
  const summary = await checkPrices(createCheckDeps(), { source: "manual", trackedUrlId });
  if (summary.checked !== 1) {
    return Response.json({ error: "No se pudo actualizar el precio" }, { status: 502 });
  }
  return Response.json(summary);
}
```

- [ ] **Step 7: Implementar `app/api/tracked-urls/route.ts`**

```ts
import { createTrackedUrl } from "@/lib/db/repo";
import { InvalidUrlError, fetchPageHtml, resolveUrl } from "@/lib/resolve-url";
import { createSolotodoClient } from "@/lib/solotodo";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: unknown; label?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url : "";
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) return Response.json({ error: "El nombre es obligatorio" }, { status: 400 });

  const client = createSolotodoClient();
  try {
    const resolved = await resolveUrl(url, {
      fetchHtml: (pageUrl) => fetchPageHtml(pageUrl),
      browse: (categoryId, params) => client.browse(categoryId, params),
    });
    const created = await createTrackedUrl({ ...resolved, label });
    return Response.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidUrlError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
```

- [ ] **Step 8: Implementar `app/api/tracked-urls/[id]/route.ts`**

```ts
import { deleteTrackedUrl, setTrackedUrlActive } from "@/lib/db/repo";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const notFound = () => Response.json({ error: "No encontrada" }, { status: 404 });

export async function PATCH(request: Request, ctx: RouteContext<"/api/tracked-urls/[id]">) {
  const body = (await request.json().catch(() => null)) as { active?: unknown } | null;
  if (typeof body?.active !== "boolean") {
    return Response.json({ error: "active debe ser true o false" }, { status: 400 });
  }
  const id = parseId((await ctx.params).id);
  if (id === null) return notFound();
  const updated = await setTrackedUrlActive(id, body.active);
  return updated ? Response.json(updated) : notFound();
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/tracked-urls/[id]">) {
  const id = parseId((await ctx.params).id);
  if (id === null) return notFound();
  return (await deleteTrackedUrl(id)) ? new Response(null, { status: 204 }) : notFound();
}
```

- [ ] **Step 9: Ejecutar los tests y verificar que pasan**

Run: `npm test`
Expected: PASS (todos, incluidos los 17 nuevos de rutas).

- [ ] **Step 10: Implementar el script del cron local**

Create `scripts/check-prices.ts`:

```ts
import { checkPrices } from "../lib/check-prices";
import { createCheckDeps } from "../lib/deps";

async function main() {
  process.loadEnvFile(".env.local");
  const summary = await checkPrices(createCheckDeps(), { source: "cron" });
  console.log(`[${new Date().toISOString()}] check-prices ${JSON.stringify(summary)}`);
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[${new Date().toISOString()}] check-prices falló:`, error);
  process.exit(1);
});
```

- [ ] **Step 11: Verificar contra la base real**

Con `.env.local` configurado (`DATABASE_URL` y un `CRON_SECRET` generado con `openssl rand -hex 32`):

```bash
npm run dev
# en otra terminal:
curl -s -X POST localhost:3000/api/tracked-urls -H 'Content-Type: application/json' \
  -d '{"url":"https://www.solotodo.cl/ssd-m2-pcie-nvme?ordering=offer_price_usd&base_buses=1559281&bus=1559594&formats=1560419&nand_types=1460586&has_dram=1460588&capacity_min=532223","label":"SSD M.2 NVMe 2TB+"}'
```
Expected: respuesta 201 con `"status":"ok"`, `"categoryId":39` y `params` que incluyen `format_families`.

```bash
npm run check-prices
```
Expected: línea `check-prices {"checked":1,"failed":0,"alerts":0}`. En el primer chequeo nunca hay email.

```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/check-prices
curl -s localhost:3000/api/check-prices -H "Authorization: Bearer $(grep ^CRON_SECRET .env.local | cut -d= -f2)"
```
Expected: `401`; después `{"checked":1,"failed":0,"alerts":0}`.

- [ ] **Step 12: Typecheck, lint y commit**

Run: `npm run typecheck && npm run lint`
Expected: sin errores.

```bash
git add lib/deps.ts app/api scripts/check-prices.ts tests/api-check-prices.test.ts tests/api-tracked-urls.test.ts
git commit -m "feat: add check-prices and tracked-urls API routes plus local cron script"
```

---

### Task 8: Dashboard

**Files:**
- Create: `lib/dashboard.ts`, `app/components/sparkline.tsx`, `app/components/tracked-url-row.tsx`, `app/components/row-actions.tsx`, `app/components/add-url-form.tsx`
- Modify: `app/page.tsx` (reemplazo completo)
- Test: `tests/dashboard.test.ts`

**Interfaces:**
- Consumes: `listTrackedUrls`, `listAllChecks` (Task 6); `productUrl` (Task 2); `formatCLP`, `formatDateTime` (Task 1); endpoints de la Task 7.
- Produces:
  - `interface DashboardRow { tracked: TrackedUrl; latest: PriceCheck | null; previous: PriceCheck | null; trend: "down" | "up" | "same" | null; productUrl: string | null; history: number[] }`
  - `HISTORY_POINTS = 30`
  - `buildDashboardRows(urls: TrackedUrl[], checks: PriceCheck[]): DashboardRow[]`
  - `sparklinePoints(values: number[], width: number, height: number, padding?: number): string`

- [ ] **Step 1: Escribir los tests que fallan**

Create `tests/dashboard.test.ts`:

```ts
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test -- tests/dashboard.test.ts`
Expected: FAIL — no se puede resolver `@/lib/dashboard`.

- [ ] **Step 3: Implementar `lib/dashboard.ts`**

```ts
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
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm test -- tests/dashboard.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Componente `Sparkline` (server)**

Create `app/components/sparkline.tsx`:

```tsx
import { sparklinePoints } from "@/lib/dashboard";

const WIDTH = 120;
const HEIGHT = 32;

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={`Histórico de precio normal (${values.length} chequeos)`}
      className="text-zinc-400"
    >
      <polyline
        points={sparklinePoints(values, WIDTH, HEIGHT, 2)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 6: Componente `RowActions` (cliente)**

Create `app/components/row-actions.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface Props {
  id: number;
  active: boolean;
  canRefresh: boolean;
}

const buttonClass =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function RowActions({ id, active, canRefresh }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(request: () => Promise<Response>, failure: string) {
    setError(null);
    startTransition(async () => {
      const response = await request().catch(() => null);
      if (!response?.ok) {
        setError(failure);
        return;
      }
      router.refresh();
    });
  }

  const refresh = () =>
    run(
      () =>
        fetch("/api/check-prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackedUrlId: id }),
        }),
      "No se pudo actualizar el precio",
    );

  const toggle = () =>
    run(
      () =>
        fetch(`/api/tracked-urls/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !active }),
        }),
      active ? "No se pudo pausar" : "No se pudo reactivar",
    );

  const remove = () => {
    if (!confirm("¿Eliminar esta URL y todo su historial?")) return;
    run(() => fetch(`/api/tracked-urls/${id}`, { method: "DELETE" }), "No se pudo eliminar");
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {canRefresh && (
          <button type="button" className={buttonClass} onClick={refresh} disabled={pending}>
            {pending ? "…" : "Refrescar ahora"}
          </button>
        )}
        <button type="button" className={buttonClass} onClick={toggle} disabled={pending}>
          {active ? "Pausar" : "Reactivar"}
        </button>
        <button type="button" className={buttonClass} onClick={remove} disabled={pending}>
          Eliminar
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Componente `TrackedUrlRow` (server)**

Create `app/components/tracked-url-row.tsx`:

```tsx
import type { DashboardRow, Trend } from "@/lib/dashboard";
import { formatCLP, formatDateTime } from "@/lib/format";
import { RowActions } from "./row-actions";
import { Sparkline } from "./sparkline";

const TREND: Record<Trend, { symbol: string; label: string; className: string }> = {
  down: { symbol: "↓", label: "bajó", className: "text-green-600" },
  up: { symbol: "↑", label: "subió", className: "text-red-600" },
  same: { symbol: "—", label: "sin cambio", className: "text-zinc-500" },
};

const linkClass = "underline decoration-zinc-300 underline-offset-2 hover:decoration-current";

export function TrackedUrlRow({ row }: { row: DashboardRow }) {
  const { tracked, latest, previous, trend, productUrl, history } = row;
  const needsReview = tracked.status === "needs_review";

  return (
    <li className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">{tracked.label}</h2>
          {!tracked.active && (
            <span className="rounded bg-zinc-100 px-1.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              Pausada
            </span>
          )}
          {needsReview && (
            <span
              className="rounded bg-amber-100 px-1.5 text-xs text-amber-800"
              title="No se pudo resolver la URL. Corrige category_id y params en la base de datos."
            >
              ⚠ Revisión pendiente
            </span>
          )}
          <a href={tracked.url} target="_blank" rel="noreferrer" className={`text-xs text-zinc-500 ${linkClass}`}>
            ver listado
          </a>
        </div>

        {latest && productUrl ? (
          <>
            <a href={productUrl} target="_blank" rel="noreferrer" className={`block truncate text-sm ${linkClass}`}>
              {latest.productName}
            </a>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-lg font-semibold">{formatCLP(latest.normalPrice)}</span>
              <span className="text-sm text-zinc-500">
                {formatCLP(latest.offerPrice)} con medio de pago específico
              </span>
              {trend && previous && (
                <span className={`text-sm ${TREND[trend].className}`}>
                  {TREND[trend].symbol} {TREND[trend].label}
                  {trend !== "same" &&
                    ` ${formatCLP(Math.abs(latest.normalPrice - previous.normalPrice))}`}
                </span>
              )}
            </p>
            <p className="text-xs text-zinc-500">
              {latest.storeName && (
                <>
                  Tienda:{" "}
                  {latest.storeUrl ? (
                    <a href={latest.storeUrl} target="_blank" rel="noreferrer" className={linkClass}>
                      {latest.storeName}
                    </a>
                  ) : (
                    latest.storeName
                  )}
                  {" · "}
                </>
              )}
              Último chequeo: {formatDateTime(latest.checkedAt)}
            </p>
          </>
        ) : (
          <p className="text-sm text-zinc-500">
            {needsReview
              ? "Sin chequeos: la URL necesita revisión."
              : "Sin chequeos todavía. Usa “Refrescar ahora”."}
          </p>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Sparkline values={history} />
        <RowActions id={tracked.id} active={tracked.active} canRefresh={!needsReview} />
      </div>
    </li>
  );
}
```

- [ ] **Step 8: Componente `AddUrlForm` (cliente)**

Create `app/components/add-url-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

type Message = { kind: "ok" | "warn" | "error"; text: string };

const MESSAGE_CLASS: Record<Message["kind"], string> = {
  ok: "text-green-700",
  warn: "text-amber-700",
  error: "text-red-600",
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export function AddUrlForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/tracked-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: data.get("url"), label: data.get("label") }),
      }).catch(() => null);

      if (!response) {
        setMessage({ kind: "error", text: "No se pudo conectar con el servidor." });
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!response.ok) {
        setMessage({ kind: "error", text: body.error ?? "No se pudo agregar la URL." });
        return;
      }
      form.reset();
      setMessage(
        body.status === "ok"
          ? { kind: "ok", text: "URL agregada. Usa “Refrescar ahora” para ver su precio." }
          : { kind: "warn", text: "URL guardada, pero no se pudo resolver: quedó en revisión." },
      );
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <label className="space-y-1 text-sm">
          <span>URL del listado en SoloTodo</span>
          <input name="url" type="url" required placeholder="https://www.solotodo.cl/ssd-m2-pcie-nvme?..." className={inputClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Nombre</span>
          <input name="label" type="text" required maxLength={100} placeholder="SSD 2TB NVMe" className={inputClass} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Agregando…" : "Agregar"}
        </button>
        {message && (
          <p role="status" className={`text-sm ${MESSAGE_CLASS[message.kind]}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 9: Reemplazar `app/page.tsx`**

`await connection()` marca la página como dinámica, para que no se prerenderice en el build (consulta la DB en cada request). Ver `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`.

```tsx
import { connection } from "next/server";
import { buildDashboardRows } from "@/lib/dashboard";
import { listAllChecks, listTrackedUrls } from "@/lib/db/repo";
import { AddUrlForm } from "./components/add-url-form";
import { TrackedUrlRow } from "./components/tracked-url-row";

export default async function Home() {
  await connection();
  const [urls, checks] = await Promise.all([listTrackedUrls(), listAllChecks()]);
  const rows = buildDashboardRows(urls, checks);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold">SoloTodo Tracker</h1>
      <p className="text-sm text-zinc-500">
        Precio normal del producto más barato de cada listado. Revisión automática una vez al día.
      </p>
      <AddUrlForm />
      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500">
          Todavía no sigues ningún listado. Pega arriba la URL de un listado de SoloTodo.
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-zinc-200 dark:divide-zinc-800">
          {rows.map((row) => (
            <TrackedUrlRow key={row.tracked.id} row={row} />
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 10: Tests, typecheck, lint y build**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: todo sin errores; el build lista `/` como dinámica (ƒ).

- [ ] **Step 11: Verificar en el navegador**

Usar la skill `run` (o `npm run dev` y abrir `http://localhost:3000`) y comprobar:
1. La URL agregada en la Task 7 aparece con nombre de producto (link a la ficha), `$` normal destacado, precio con medio de pago, tienda con link y fecha del último chequeo.
2. "Refrescar ahora" termina sin error y actualiza la fecha; la fila muestra "— sin cambio" y el sparkline aparece al tener 2 o más registros.
3. Agregar `https://evil.com/x` muestra "La URL debe ser de solotodo.cl".
4. Agregar `https://www.solotodo.cl/` muestra el aviso "quedó en revisión"; la fila tiene el badge "⚠ Revisión pendiente" y no tiene "Refrescar ahora".
5. "Pausar" muestra el badge "Pausada" y el botón cambia a "Reactivar".
6. "Eliminar" en la fila de revisión pide confirmación y la quita.
7. La vista funciona en un ancho de ~375 px (la fila se apila en columna).

- [ ] **Step 12: Commit**

```bash
git add lib/dashboard.ts app tests/dashboard.test.ts
git commit -m "feat: add tracking dashboard with refresh, pause and delete actions"
```

---

### Task 9: Cron diario local, config de Vercel y verificación end-to-end

**Files:**
- Create: `scripts/install-launchd.sh`, `vercel.json`
- Modify: `README.md` (reemplazo completo)

**Interfaces:**
- Consumes: `npm run check-prices` y `GET /api/check-prices` (Task 7).
- Produces: el LaunchAgent `cl.narce.solotodo-tracker`, que ejecuta el chequeo todos los días a las 09:00; el cron de Vercel para el deploy futuro; la documentación de operación.

- [ ] **Step 1: Script instalador del LaunchAgent**

Create `scripts/install-launchd.sh`:

```bash
#!/usr/bin/env bash
# Instala (o reinstala) el LaunchAgent que ejecuta el chequeo diario a las 09:00.
set -euo pipefail

LABEL="cl.narce.solotodo-tracker"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN_DIR="$(dirname "$(command -v node)")"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$PROJECT_DIR/logs" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PROJECT_DIR/node_modules/.bin/tsx</string>
    <string>scripts/check-prices.ts</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$NODE_BIN_DIR:/usr/bin:/bin</string></dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$PROJECT_DIR/logs/check-prices.log</string>
  <key>StandardErrorPath</key><string>$PROJECT_DIR/logs/check-prices.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "LaunchAgent instalado: $PLIST"
echo "Ejecutar ahora:  launchctl kickstart -k gui/$(id -u)/$LABEL"
echo "Log:             $PROJECT_DIR/logs/check-prices.log"
```

Run: `chmod +x scripts/install-launchd.sh && bash -n scripts/install-launchd.sh`
Expected: sin salida (sintaxis válida).

- [ ] **Step 2: Instalar el LaunchAgent (con confirmación del usuario)**

Este paso modifica `~/Library/LaunchAgents`. Pedir confirmación al usuario antes de ejecutarlo.

```bash
./scripts/install-launchd.sh
launchctl kickstart -k gui/$(id -u)/cl.narce.solotodo-tracker
sleep 20; tail -n 5 logs/check-prices.log
```
Expected: el log muestra una línea `check-prices {"checked":N,"failed":0,...}`, con N igual a la cantidad de URLs activas y en estado ok.

- [ ] **Step 3: Configuración del cron de Vercel**

Create `vercel.json`. `0 12 * * *` es 12:00 UTC, que corresponde a las 09:00 o 08:00 en Chile según el horario de verano:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [{ "path": "/api/check-prices", "schedule": "0 12 * * *" }]
}
```

- [ ] **Step 4: Reemplazar `README.md`**

````markdown
# SoloTodo Tracker

Seguimiento personal de precios sobre listados filtrados de [SoloTodo](https://www.solotodo.cl).
Cada día guarda el precio normal del producto más barato de cada listado y envía un email si bajó.

Diseño: `docs/superpowers/specs/2026-09-28-solotodo-price-tracker-design.md`

## Setup

1. `npm install`
2. `cp .env.example .env.local` y completar:
   - `DATABASE_URL`: connection string "pooled" de Neon.
   - `RESEND_API_KEY`: API key de Resend.
   - `ALERT_EMAIL`: destinatario. Con el remitente por defecto (`onboarding@resend.dev`), Resend solo entrega al email de tu cuenta de Resend.
   - `CRON_SECRET`: `openssl rand -hex 32`.
3. `npm run db:migrate`
4. `npm run dev` y abrir http://localhost:3000

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Dashboard en localhost:3000 |
| `npm test` | Tests (Vitest) |
| `npm run typecheck` | Tipos (incluye `next typegen`) |
| `npm run check-prices` | Ejecuta el chequeo como cron (puede enviar emails) |
| `npm run db:generate` / `db:migrate` | Migraciones Drizzle |

## Cron local (macOS)

`./scripts/install-launchd.sh` instala un LaunchAgent que ejecuta `scripts/check-prices.ts` todos los días a las 09:00, sin necesidad de tener `next dev` corriendo. Si el Mac está dormido a esa hora, se ejecuta al despertar; si está apagado, ese día se salta.

- Ejecutar ahora: `launchctl kickstart -k gui/$(id -u)/cl.narce.solotodo-tracker`
- Log: `logs/check-prices.log`
- Desinstalar: `launchctl bootout gui/$(id -u)/cl.narce.solotodo-tracker && rm ~/Library/LaunchAgents/cl.narce.solotodo-tracker.plist`

## URLs en revisión

Si al agregar una URL no se puede resolver su categoría o el listado de prueba no trae resultados, queda con `status = 'needs_review'` y no se chequea. Para corregirla, editar `category_id` y `params` en la tabla `tracked_urls` (por ejemplo, desde el SQL Editor de Neon) y dejar `status = 'ok'`. `params` es un JSON `{ "clave": ["valor", ...] }` con los mismos filtros de la URL del sitio.

## Deploy a Vercel (futuro)

1. Importar el repo en Vercel y copiar las variables de entorno de `.env.local`.
2. **Activar Deployment Protection** antes de exponer la app: el dashboard y `/api/tracked-urls` no tienen autenticación propia.
3. `vercel.json` ya declara el cron diario sobre `/api/check-prices`, que Vercel llama por GET con `Authorization: Bearer $CRON_SECRET`. Desinstalar el LaunchAgent local para no duplicar los chequeos.
````

- [ ] **Step 5: Verificación end-to-end del email (con el usuario)**

Pedirle al usuario `RESEND_API_KEY` y confirmar `ALERT_EMAIL` en `.env.local`. Después:

1. `npm run check-prices` para tener un registro base (no envía email si no hay una baja).
2. Pedirle al usuario que ejecute en el SQL Editor de Neon, para simular que el precio anterior era más alto:
   ```sql
   UPDATE price_checks SET normal_price = normal_price + 10000
   WHERE id = (SELECT max(id) FROM price_checks);
   ```
3. `npm run check-prices`.
   Expected: el log muestra `"alerts":1` y el email "Bajó de precio: …" llega a `ALERT_EMAIL` con los precios anterior y nuevo, la tienda y los links.
4. Hacer "Refrescar ahora" en el dashboard después de repetir el paso 2.
   Expected: el registro se actualiza y **no** llega email.

- [ ] **Step 6: Suite completa y commit**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: todo sin errores.

```bash
git add scripts/install-launchd.sh vercel.json README.md
git status   # confirmar que logs/ y .env.local no están staged
git commit -m "feat: add daily launchd cron, Vercel cron config and operations README"
```
