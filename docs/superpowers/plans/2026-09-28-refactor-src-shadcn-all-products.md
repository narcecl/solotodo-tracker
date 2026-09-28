# Refactor src/ + shadcn/ui + Todos los productos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the app code to `src/`, migrate the UI to shadcn/ui, store every product from each listing check, show them in an accordion, and email when any product's `normal_price` changes.

**Architecture:** Pure domain helpers (`toCheckProducts`, `diffProducts`) live in `src/lib/product-changes.ts` and are shared by the price checker and the dashboard. Each check writes one `price_checks` summary row (cheapest + store) plus N `url_check_products` rows in a single transaction. The dashboard keeps `buildDashboardRows` pure; `page.tsx` loads products for the last two checks per URL through the repo.

**Tech Stack:** Next.js 16.3.6 (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui (Radix), Drizzle ORM + postgres.js (Supabase), Resend, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-refactor-src-shadcn-all-products-design.md`

## Global Constraints

- Next.js is 16.3.6 and differs from training data: read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (AGENTS.md).
- Only `app/` and `lib/` move to `src/`. `scripts/`, `tests/`, `drizzle/`, `public/` and config files stay in the root.
- `app/components/` becomes `src/components/dashboard/`; shadcn components go to `src/components/ui/`.
- UI copy, email copy, log messages and code comments are in Spanish; identifiers in English (match existing code).
- Email subject is exactly: `Hubo cambios de precio en <label>`.
- Emails are only sent when `source === "cron"`.
- Products are compared by `product_id`. Disappeared products are ignored (not listed, no email). New products are listed as "Nuevo" and never trigger an email by themselves.
- No email when the previous check has no rows in `url_check_products`.
- No test database: every test mocks the repo / clients.
- shadcn/ui uses Radix primitives, base color neutral, and dark mode via `prefers-color-scheme` (not a `.dark` class).
- Never run `npm run db:migrate` or `npm run check-prices` without asking the user first: both touch the real Supabase database, and `check-prices` can send real emails.

## Review Focus

- Tied prices on the listing page: sorting must be stable so `position = 0` is the first product the API returned (same as today's `cheapestBy`). Pinned in Task 3.
- First cron run after the migration: previous check exists but has no products → no email, even if the cheapest price dropped. Pinned in Task 5.
- A new, cheaper product appears while the others keep their price → no email, but the dashboard shows it with a "Nuevo" badge. Pinned in Tasks 5 and 6.
- A manual refresh between two cron runs absorbs the change, so the next cron sends nothing (accepted existing behavior). Pinned in Task 5.
- Product names containing HTML in the multi-product email table must be escaped. Pinned in Task 5.

---

### Task 1: Move app code to `src/`

Pure move, no behavior changes.

**Files:**
- Move: `app/` → `src/app/`, `lib/` → `src/lib/`, `src/app/components/` → `src/components/dashboard/`
- Modify: `tsconfig.json`, `vitest.config.ts`, `drizzle.config.ts`, `scripts/check-prices.ts`, `src/app/page.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `@/*` resolves to `./src/*` in Next, TypeScript and Vitest. Dashboard components are imported from `@/components/dashboard/<name>`.

- [ ] **Step 1: Move the folders with git**

```bash
mkdir -p src/components
git mv app src/app
git mv lib src/lib
git mv src/app/components src/components/dashboard
rm -rf .next
```

- [ ] **Step 2: Update `tsconfig.json` paths**

Change:

```json
    "paths": {
      "@/*": ["./*"]
    }
```

to:

```json
    "paths": {
      "@/*": ["./src/*"]
    }
```

Leave `include` as it is (`**/*.ts` still covers `scripts/` and `tests/`).

- [ ] **Step 3: Update `vitest.config.ts` alias**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@/": fileURLToPath(new URL("./src/", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Update `drizzle.config.ts` schema path**

Change `schema: "./lib/db/schema.ts",` to `schema: "./src/lib/db/schema.ts",`.

- [ ] **Step 5: Update the imports in `scripts/check-prices.ts`**

```ts
import { checkPrices } from "../src/lib/check-prices";
import { closeDb } from "../src/lib/db";
import { createCheckDeps } from "../src/lib/deps";
```

- [ ] **Step 6: Update the component imports in `src/app/page.tsx`**

Replace:

```ts
import { AddUrlForm } from "./components/add-url-form";
import { TrackedUrlRow } from "./components/tracked-url-row";
```

with:

```ts
import { AddUrlForm } from "@/components/dashboard/add-url-form";
import { TrackedUrlRow } from "@/components/dashboard/tracked-url-row";
```

(`tracked-url-row.tsx` imports `./row-actions` and `./sparkline` relatively; they moved together, so no change there.)

- [ ] **Step 7: Verify nothing still points at the old paths**

Run: `grep -rn "from \"\.\./lib\|/app/components\|\./components/" src scripts tests`
Expected: no output.

- [ ] **Step 8: Run the full verification**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: every test passes (same count as before the move), typecheck/lint have no errors, and the build succeeds listing the `/`, `/api/check-prices` and `/api/tracked-urls` routes.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: move app code to src/"
```

---

### Task 2: shadcn/ui setup and component migration

Same functionality, new components. Dashboard rows become cards.

**Files:**
- Create (by CLI): `components.json`, `src/lib/utils.ts`, `src/components/ui/{accordion,badge,button,card,input,table}.tsx`
- Modify: `src/app/globals.css`, `src/components/dashboard/add-url-form.tsx`, `src/components/dashboard/row-actions.tsx`, `src/components/dashboard/tracked-url-row.tsx`, `src/components/dashboard/sparkline.tsx`, `src/app/page.tsx`, `package.json` / `package-lock.json` (by CLI)

**Interfaces:**
- Consumes: `@/*` → `./src/*` (Task 1).
- Produces: `@/components/ui/accordion` (`Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`), `@/components/ui/badge` (`Badge`), `@/components/ui/button` (`Button`), `@/components/ui/card` (`Card`, `CardHeader`, `CardTitle`, `CardContent`), `@/components/ui/input` (`Input`), `@/components/ui/table` (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`), `@/lib/utils` (`cn`).

- [ ] **Step 1: Initialize shadcn**

Run: `npx shadcn@latest init --base-color neutral`
If it asks: choose **Radix** as the primitives library, **Neutral** as the base color, and accept `src/` / `@/components` / `@/lib/utils` aliases. If Next 16 or Tailwind v4 is not supported, stop and report it (the spec's fallback is a manual install from the registry, which needs its own plan).

- [ ] **Step 2: Add the components**

Run: `npx shadcn@latest add accordion badge button card input table`
Expected: six files in `src/components/ui/`.

- [ ] **Step 3: Confirm the accordion is Radix-based**

Run: `grep -n "radix" src/components/ui/accordion.tsx`
Expected: an import from `radix-ui` or `@radix-ui/react-accordion`. If it imports Base UI instead, remove the `src/components/ui` files and re-run Steps 1–2 choosing Radix. The accordion code in Task 7 uses the Radix API (`type="single" collapsible`).

- [ ] **Step 4: Switch dark mode to `prefers-color-scheme` in `src/app/globals.css`**

The CLI rewrote this file with CSS variables. Make these edits:
1. Delete the line `@custom-variant dark (&:is(.dark *));` (without it, Tailwind's `dark:` variant uses `prefers-color-scheme`).
2. Wrap the `.dark { ... }` block in a media query and change its selector to `:root`:

```css
@media (prefers-color-scheme: dark) {
  :root {
    /* keep every variable exactly as the CLI generated it inside .dark */
  }
}
```

3. If the old blocks are still there, delete the original `:root { --background: #ffffff; --foreground: #171717; }`, the old `@media (prefers-color-scheme: dark)` with `#0a0a0a`, and the `body { background: …; color: …; font-family: Arial, Helvetica, sans-serif; }` block.
4. Make sure the `@theme inline` block still contains `--font-sans: var(--font-geist-sans);` and `--font-mono: var(--font-geist-mono);` (add them back if the CLI dropped them).

- [ ] **Step 5: Migrate `src/components/dashboard/add-url-form.tsx`**

Keep all the logic and replace only the imports, the `inputClass` constant and the JSX:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Message = { kind: "ok" | "warn" | "error"; text: string };

const MESSAGE_CLASS: Record<Message["kind"], string> = {
  ok: "text-green-700 dark:text-green-400",
  warn: "text-amber-700 dark:text-amber-400",
  error: "text-destructive",
};

export function AddUrlForm() {
  // ...router, pending, message and onSubmit exactly as before...

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <label className="space-y-1 text-sm">
          <span>URL del listado en SoloTodo</span>
          <Input name="url" type="url" required placeholder="https://www.solotodo.cl/ssd-m2-pcie-nvme?..." />
        </label>
        <label className="space-y-1 text-sm">
          <span>Nombre</span>
          <Input name="label" type="text" required maxLength={100} placeholder="SSD 2TB NVMe" />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Agregando…" : "Agregar"}
        </Button>
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

- [ ] **Step 6: Migrate `src/components/dashboard/row-actions.tsx`**

Delete the `buttonClass` constant, add `import { Button } from "@/components/ui/button";`, and replace the returned JSX (logic unchanged):

```tsx
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {canRefresh && (
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={pending}>
            {pending ? "…" : "Refrescar ahora"}
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={toggle} disabled={pending}>
          {active ? "Pausar" : "Reactivar"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={remove} disabled={pending}>
          Eliminar
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
```

- [ ] **Step 7: Use the theme color in `src/components/dashboard/sparkline.tsx`**

Change `className="text-zinc-400"` to `className="text-muted-foreground"`.

- [ ] **Step 8: Rewrite `src/components/dashboard/tracked-url-row.tsx` as a card**

```tsx
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardRow, Trend } from "@/lib/dashboard";
import { formatCLP, formatDateTime } from "@/lib/format";
import { RowActions } from "./row-actions";
import { Sparkline } from "./sparkline";

const TREND: Record<Trend, { symbol: string; label: string; className: string }> = {
  down: { symbol: "↓", label: "bajó", className: "text-green-600 dark:text-green-400" },
  up: { symbol: "↑", label: "subió", className: "text-red-600 dark:text-red-400" },
  same: { symbol: "—", label: "sin cambio", className: "text-muted-foreground" },
};

const linkClass = "underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-current";

export function TrackedUrlRow({ row }: { row: DashboardRow }) {
  const { tracked, latest, previous, trend, productUrl, history } = row;
  const needsReview = tracked.status === "needs_review";

  return (
    <li>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{tracked.label}</CardTitle>
            {!tracked.active && <Badge variant="secondary">Pausada</Badge>}
            {needsReview && (
              <Badge
                variant="outline"
                className="border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300"
                title="No se pudo resolver la URL. Corrige category_id y params en la base de datos."
              >
                ⚠ Revisión pendiente
              </Badge>
            )}
            <a href={tracked.url} target="_blank" rel="noreferrer" className={`text-xs text-muted-foreground ${linkClass}`}>
              ver listado
            </a>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            {latest && productUrl ? (
              <>
                <a href={productUrl} target="_blank" rel="noreferrer" className={`block truncate text-sm ${linkClass}`}>
                  {latest.productName}
                </a>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-lg font-semibold">{formatCLP(latest.normalPrice)}</span>
                  <span className="text-sm text-muted-foreground">
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
                <p className="text-xs text-muted-foreground">
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
              <p className="text-sm text-muted-foreground">
                {needsReview
                  ? "Sin chequeos: la URL necesita revisión."
                  : "Sin chequeos todavía. Usa \"Refrescar ahora\"."}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <Sparkline values={history} />
            <RowActions id={tracked.id} active={tracked.active} canRefresh={!needsReview} />
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
```

- [ ] **Step 9: Update the list and muted text in `src/app/page.tsx`**

- Replace `<ul className="mt-8 divide-y divide-zinc-200 dark:divide-zinc-800">` with `<ul className="mt-8 space-y-4">`.
- Replace both `text-zinc-500` with `text-muted-foreground`.

- [ ] **Step 10: Verify no hardcoded zinc colors remain**

Run: `grep -rn "zinc" src/app src/components/dashboard`
Expected: no output.

- [ ] **Step 11: Run the checks**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 12: Visual check**

Run `npm run dev` and open http://localhost:3000 in light and dark system themes. Expected: form with shadcn inputs/button, one card per tracked URL, "Pausada" / "Revisión pendiente" badges, outline action buttons. Stop the dev server afterwards.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: migrate dashboard UI to shadcn/ui"
```

---

### Task 3: Product types and pure comparison helpers

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/product-changes.ts`
- Test: `tests/product-changes.test.ts`

**Interfaces:**
- Consumes: `BrowseEntry` from `src/lib/types.ts`.
- Produces (in `src/lib/types.ts`):
  ```ts
  export interface CheckProduct { productId: number; name: string; slug: string; normalPrice: number; offerPrice: number; position: number }
  export type ProductChangeKind = "down" | "up" | "same" | "new";
  export interface ProductChange extends CheckProduct { previousNormalPrice: number | null; kind: ProductChangeKind }
  export interface PriceChangeAlert { label: string; listingUrl: string; products: ProductChange[] }
  ```
- Produces (in `src/lib/product-changes.ts`):
  - `toCheckProducts(entries: BrowseEntry[]): CheckProduct[]`: sorted by `normalPrice` ascending (stable), `position` 0..n-1.
  - `diffProducts(current: CheckProduct[], previous: CheckProduct[]): ProductChange[]`: ordered by `position`; with an empty `previous`, every item is `kind: "same"` and `previousNormalPrice: null`.
  - `hasPriceChanges(changes: ProductChange[]): boolean`: true if any item is `down` or `up`.

- [ ] **Step 1: Write the failing test `tests/product-changes.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { diffProducts, hasPriceChanges, toCheckProducts } from "@/lib/product-changes";
import type { BrowseEntry, CheckProduct, ProductChange } from "@/lib/types";

const entry = (productId: number, normalPrice: number): BrowseEntry => ({
  productId,
  name: `P${productId}`,
  slug: `p${productId}`,
  normalPrice,
  offerPrice: normalPrice - 1000,
});

const product = (productId: number, normalPrice: number, position: number): CheckProduct => ({
  ...entry(productId, normalPrice),
  position,
});

describe("toCheckProducts", () => {
  it("ordena por precio normal y asigna position desde 0", () => {
    expect(toCheckProducts([entry(1, 500), entry(2, 300), entry(3, 400)])).toEqual([
      product(2, 300, 0),
      product(3, 400, 1),
      product(1, 500, 2),
    ]);
  });

  it("en empate conserva el orden en que llegaron", () => {
    expect(toCheckProducts([entry(1, 300), entry(2, 300), entry(3, 100)]).map((p) => p.productId)).toEqual([
      3, 1, 2,
    ]);
  });

  it("lista vacía", () => {
    expect(toCheckProducts([])).toEqual([]);
  });
});

describe("diffProducts", () => {
  it("compara por product_id: bajó, subió, igual y nuevo", () => {
    const previous = [product(1, 100, 0), product(2, 200, 1), product(3, 300, 2)];
    const current = [product(4, 50, 0), product(1, 90, 1), product(2, 210, 2), product(3, 300, 3)];
    expect(diffProducts(current, previous).map((c) => [c.productId, c.kind, c.previousNormalPrice])).toEqual([
      [4, "new", null],
      [1, "down", 100],
      [2, "up", 200],
      [3, "same", 300],
    ]);
  });

  it("ignora los productos que desaparecieron", () => {
    const changes = diffProducts([product(1, 100, 0)], [product(2, 50, 0), product(1, 100, 1)]);
    expect(changes.map((c) => c.productId)).toEqual([1]);
    expect(changes[0].kind).toBe("same");
  });

  it("sin productos anteriores: todos same y sin precio anterior", () => {
    expect(diffProducts([product(1, 100, 0)], [])).toEqual([
      { ...product(1, 100, 0), previousNormalPrice: null, kind: "same" },
    ]);
  });

  it("devuelve la lista ordenada por position", () => {
    const changes = diffProducts([product(2, 200, 1), product(1, 100, 0)], []);
    expect(changes.map((c) => c.position)).toEqual([0, 1]);
  });
});

describe("hasPriceChanges", () => {
  const change = (kind: ProductChange["kind"], previousNormalPrice: number | null): ProductChange => ({
    ...product(1, 100, 0),
    previousNormalPrice,
    kind,
  });

  it("es true solo si algún producto bajó o subió", () => {
    expect(hasPriceChanges([change("same", 100), change("new", null)])).toBe(false);
    expect(hasPriceChanges([change("same", 100), change("down", 120)])).toBe(true);
    expect(hasPriceChanges([change("up", 80)])).toBe(true);
    expect(hasPriceChanges([])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/product-changes.test.ts`
Expected: FAIL, cannot resolve `@/lib/product-changes`.

- [ ] **Step 3: Add the types to `src/lib/types.ts`**

Append after `BrowseEntry` (keep `PriceDropAlert` for now; Task 5 removes it):

```ts
export interface CheckProduct {
  productId: number;
  name: string;
  slug: string;
  normalPrice: number;
  offerPrice: number;
  position: number; // 0 = más barato
}

export type ProductChangeKind = "down" | "up" | "same" | "new";

export interface ProductChange extends CheckProduct {
  previousNormalPrice: number | null; // null si kind === "new" o no hay chequeo anterior con productos
  kind: ProductChangeKind;
}

export interface PriceChangeAlert {
  label: string;
  listingUrl: string;
  products: ProductChange[]; // ordenados por position
}
```

- [ ] **Step 4: Create `src/lib/product-changes.ts`**

```ts
import type { BrowseEntry, CheckProduct, ProductChange, ProductChangeKind } from "./types";

// Orden estable: en empate queda primero el que la API devolvió antes
export function toCheckProducts(entries: BrowseEntry[]): CheckProduct[] {
  return entries
    .toSorted((a, b) => a.normalPrice - b.normalPrice)
    .map((entry, position) => ({
      productId: entry.productId,
      name: entry.name,
      slug: entry.slug,
      normalPrice: entry.normalPrice,
      offerPrice: entry.offerPrice,
      position,
    }));
}

function kindOf(previous: number, current: number): ProductChangeKind {
  if (current < previous) return "down";
  if (current > previous) return "up";
  return "same";
}

// Compara por product_id. Los productos que ya no están en `current` se ignoran.
export function diffProducts(current: CheckProduct[], previous: CheckProduct[]): ProductChange[] {
  const previousPrices = new Map(previous.map((p) => [p.productId, p.normalPrice]));
  return current
    .toSorted((a, b) => a.position - b.position)
    .map((product): ProductChange => {
      if (previous.length === 0) return { ...product, previousNormalPrice: null, kind: "same" };
      const before = previousPrices.get(product.productId);
      if (before === undefined) return { ...product, previousNormalPrice: null, kind: "new" };
      return { ...product, previousNormalPrice: before, kind: kindOf(before, product.normalPrice) };
    });
}

export function hasPriceChanges(changes: ProductChange[]): boolean {
  return changes.some((c) => c.kind === "down" || c.kind === "up");
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/product-changes.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/lib/types.ts src/lib/product-changes.ts tests/product-changes.test.ts
git commit -m "feat: add product types and diff helpers"
```

---

### Task 4: Store every product (schema, migration, repo, checker)

After this task each check saves all products. Alert behavior is still the old one (cheapest drop); Task 5 replaces it.

**Files:**
- Modify: `src/lib/db/schema.ts`, `src/lib/db/repo.ts`, `src/lib/check-prices.ts`
- Create (generated): `drizzle/0001_<random_name>.sql`, `drizzle/meta/0001_snapshot.json`, `drizzle/meta/_journal.json` (updated)
- Test: `tests/check-prices.test.ts`

**Interfaces:**
- Consumes: `CheckProduct` (Task 3), `toCheckProducts(entries)` (Task 3).
- Produces:
  - Drizzle table `urlCheckProducts` exported from `src/lib/db/schema.ts`.
  - `PriceRepo` (in `src/lib/check-prices.ts`):
    ```ts
    export interface PriceRepo {
      listCheckableUrls(): Promise<TrackedUrl[]>;
      getTrackedUrl(id: number): Promise<TrackedUrl | null>;
      getLastCheck(trackedUrlId: number): Promise<PriceCheck | null>;
      getCheckProducts(priceCheckId: number): Promise<CheckProduct[]>;
      insertCheck(check: NewPriceCheck, products: CheckProduct[]): Promise<PriceCheck>;
    }
    ```
  - `listProductsForChecks(checkIds: number[]): Promise<Map<number, CheckProduct[]>>` exported from `src/lib/db/repo.ts` (products ordered by `position`).
  - Test helpers in `tests/check-prices.test.ts`: `product(overrides)` and the `previousProducts` setup option (products of the check with id 100); `repo.productsByCheck: Map<number, CheckProduct[]>`.

- [ ] **Step 1: Update the fake repo and setup in `tests/check-prices.test.ts`**

Change the type import to include `CheckProduct`:

```ts
import type { BrowseEntry, CheckProduct, PriceCheck, StoreOffer, TrackedUrl } from "@/lib/types";
```

Add this helper after `previousCheck`:

```ts
function product(overrides: Partial<CheckProduct> = {}): CheckProduct {
  return {
    productId: 127681,
    name: "A-DATA XPG Gammix S70 BLADE 2 TB",
    slug: "a-data-xpg-gammix-s70-blade-2-tb",
    normalPrice: 400889,
    offerPrice: 379990,
    position: 0,
    ...overrides,
  };
}
```

Replace `makeRepo` with:

```ts
function makeRepo(
  urls: TrackedUrl[],
  checks: PriceCheck[],
  productsByCheck: Map<number, CheckProduct[]>,
): PriceRepo & { checks: PriceCheck[]; productsByCheck: Map<number, CheckProduct[]> } {
  let nextId = 1000;
  return {
    checks,
    productsByCheck,
    async listCheckableUrls() {
      return urls.filter((u) => u.active && u.status === "ok");
    },
    async getTrackedUrl(id) {
      return urls.find((u) => u.id === id) ?? null;
    },
    async getLastCheck(trackedUrlId) {
      return checks.filter((c) => c.trackedUrlId === trackedUrlId).at(-1) ?? null;
    },
    async getCheckProducts(priceCheckId) {
      return productsByCheck.get(priceCheckId) ?? [];
    },
    async insertCheck(check, products) {
      const saved: PriceCheck = { ...check, id: nextId++, checkedAt: new Date() };
      checks.push(saved);
      productsByCheck.set(saved.id, products);
      return saved;
    },
  };
}
```

In `SetupOptions` add `previousProducts?: CheckProduct[];` (products of the check with id 100, the default `previousCheck`). At the start of `setup`, replace the `repo` line with:

```ts
  const productsByCheck = new Map<number, CheckProduct[]>();
  if (options.previousProducts) productsByCheck.set(100, options.previousProducts);
  const repo = makeRepo(options.urls ?? [tracked()], options.checks ?? [], productsByCheck);
```

- [ ] **Step 2: Add the failing tests at the end of `tests/check-prices.test.ts`**

```ts
describe("checkPrices: productos del listado", () => {
  it("guarda todos los productos ordenados por precio normal con su position", async () => {
    const { deps, repo } = setup({
      entries: [
        entry({ productId: 1, normalPrice: 500000 }),
        entry({ productId: 2, normalPrice: 350000 }),
        entry({ productId: 3, normalPrice: 450000 }),
      ],
    });
    await checkPrices(deps, { source: "cron" });
    const saved = repo.checks.at(-1)!;
    expect(saved).toMatchObject({ productId: 2, normalPrice: 350000 });
    expect(repo.productsByCheck.get(saved.id)?.map((p) => [p.productId, p.normalPrice, p.position])).toEqual([
      [2, 350000, 0],
      [3, 450000, 1],
      [1, 500000, 2],
    ]);
  });

  it("busca la tienda solo del producto más barato", async () => {
    const { deps, solotodo } = setup({
      entries: [entry({ productId: 1, normalPrice: 500000 }), entry({ productId: 2, normalPrice: 350000 })],
    });
    await checkPrices(deps, { source: "cron" });
    expect(solotodo.getAvailableOffers).toHaveBeenCalledTimes(1);
    expect(solotodo.getAvailableOffers).toHaveBeenCalledWith(2);
  });

  it("también guarda los productos en chequeos manuales", async () => {
    const { deps, repo } = setup();
    await checkPrices(deps, { source: "manual", trackedUrlId: 1 });
    expect(repo.productsByCheck.get(repo.checks.at(-1)!.id)).toEqual([product()]);
  });
});
```

- [ ] **Step 3: Run the tests to verify the new ones fail**

Run: `npx vitest run tests/check-prices.test.ts`
Expected: the "productos del listado" tests FAIL (`productsByCheck.get(...)` is `undefined` because `insertCheck` receives no products); the existing tests still pass.

- [ ] **Step 4: Add the table to `src/lib/db/schema.ts`**

Change the import line to:

```ts
import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
```

Append:

```ts
export const urlCheckProducts = pgTable(
  "url_check_products",
  {
    id: serial("id").primaryKey(),
    priceCheckId: integer("price_check_id")
      .notNull()
      .references(() => priceChecks.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    normalPrice: integer("normal_price").notNull(),
    offerPrice: integer("offer_price").notNull(),
    position: integer("position").notNull(),
  },
  // El índice único también sirve para buscar por price_check_id (primera columna)
  (table) => [unique("url_check_products_check_position_unique").on(table.priceCheckId, table.position)],
);
```

- [ ] **Step 5: Update `PriceRepo` and `checkOne` in `src/lib/check-prices.ts`**

Imports at the top:

```ts
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
```

`PriceRepo`:

```ts
export interface PriceRepo {
  listCheckableUrls(): Promise<TrackedUrl[]>;
  getTrackedUrl(id: number): Promise<TrackedUrl | null>;
  getLastCheck(trackedUrlId: number): Promise<PriceCheck | null>;
  getCheckProducts(priceCheckId: number): Promise<CheckProduct[]>;
  insertCheck(check: NewPriceCheck, products: CheckProduct[]): Promise<PriceCheck>;
}
```

In `checkOne`, replace everything from `const cheapest: BrowseEntry | null = …` down to the closing `});` of `insertCheck` with:

```ts
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
```

The rest of `checkOne` (the old alert) stays unchanged in this task. `cheapestBy` is still used by `findStore`.

- [ ] **Step 6: Implement the repo in `src/lib/db/repo.ts`**

Imports:

```ts
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { PriceRepo } from "../check-prices";
import type { CheckProduct, Params, PriceCheck, TrackedUrl, TrackedUrlStatus } from "../types";
import { getDb } from "./index";
import { priceChecks, trackedUrls, urlCheckProducts } from "./schema";

const productColumns = {
  productId: urlCheckProducts.productId,
  name: urlCheckProducts.name,
  slug: urlCheckProducts.slug,
  normalPrice: urlCheckProducts.normalPrice,
  offerPrice: urlCheckProducts.offerPrice,
  position: urlCheckProducts.position,
};
```

In `priceRepo`, add `getCheckProducts` and replace `insertCheck`:

```ts
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
```

Add after `listAllChecks`:

```ts
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
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/check-prices.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 8: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/0001_<name>.sql`. Check its content:

Run: `cat drizzle/0001_*.sql`
Expected: `CREATE TABLE "url_check_products"` with the 8 columns, the `url_check_products_check_position_unique` UNIQUE constraint on `("price_check_id","position")`, and a FK to `price_checks` with `ON DELETE cascade`. No changes to `price_checks` or `tracked_urls`.

- [ ] **Step 9: Ask the user before applying the migration**

Tell the user: "The `url_check_products` migration is ready. `npm run db:migrate` applies it to the database in `.env.local` (Supabase). It must be applied before this code runs in any environment (local cron or Vercel), otherwise every check fails when it tries to insert the products. Should I run it?" Run `npm run db:migrate` only if they say yes, and record the output. If they say no, keep going: tests don't need the database.

- [ ] **Step 10: Typecheck, lint and commit**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

```bash
git add src/lib/db/schema.ts src/lib/db/repo.ts src/lib/check-prices.ts tests/check-prices.test.ts drizzle/
git commit -m "feat: store every listing product per check"
```

---

### Task 5: Multi-product change alert (checker + email)

**Files:**
- Modify: `src/lib/check-prices.ts`, `src/lib/email.ts`, `src/lib/types.ts`, `README.md`
- Test: `tests/check-prices.test.ts`, `tests/email.test.ts`

**Interfaces:**
- Consumes: `diffProducts`, `hasPriceChanges` (Task 3); `PriceChangeAlert`, `ProductChange` (Task 3); `PriceRepo.getCheckProducts` (Task 4); test helpers `product()` and `previousProducts` (Task 4).
- Produces:
  - `CheckDeps.sendAlert(alert: PriceChangeAlert): Promise<void>`
  - `buildAlertEmail(alert: PriceChangeAlert): EmailMessage`
  - `createAlertSender(resend, config)` returns `(alert: PriceChangeAlert) => Promise<void>`
  - `PriceDropAlert` removed from `src/lib/types.ts`.

- [ ] **Step 1: Rewrite `tests/email.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { buildAlertEmail, createAlertSender, type ResendLike } from "@/lib/email";
import type { PriceChangeAlert } from "@/lib/types";

const ALERT: PriceChangeAlert = {
  label: "SSD 2TB",
  listingUrl: "https://www.solotodo.cl/ssd-m2-pcie-nvme",
  products: [
    { productId: 1, name: "Kingston NV3 2 TB", slug: "kingston-nv3", normalPrice: 300000, offerPrice: 290000, position: 0, previousNormalPrice: null, kind: "new" },
    { productId: 127681, name: "A-DATA XPG", slug: "a-data-xpg", normalPrice: 400889, offerPrice: 379990, position: 1, previousNormalPrice: 420000, kind: "down" },
    { productId: 3, name: "WD Black", slug: "wd-black", normalPrice: 450000, offerPrice: 440000, position: 2, previousNormalPrice: 430000, kind: "up" },
    { productId: 4, name: "Samsung 990", slug: "samsung-990", normalPrice: 500000, offerPrice: 480000, position: 3, previousNormalPrice: 500000, kind: "same" },
  ],
};

describe("buildAlertEmail", () => {
  it("usa el asunto con el label", () => {
    expect(buildAlertEmail(ALERT).subject).toBe("Hubo cambios de precio en SSD 2TB");
  });

  it("lista todos los productos en orden de position, con link a su ficha y al listado", () => {
    const email = buildAlertEmail(ALERT);
    for (const part of [email.html, email.text]) {
      expect(part).toContain("SSD 2TB");
      expect(part).toContain("https://www.solotodo.cl/ssd-m2-pcie-nvme");
      expect(part).toContain("https://www.solotodo.cl/products/127681-a-data-xpg");
      expect(part).toContain("$379.990");
      const order = ["Kingston NV3 2 TB", "A-DATA XPG", "WD Black", "Samsung 990"].map((name) => part.indexOf(name));
      expect(order.every((index) => index >= 0)).toBe(true);
      expect(order).toEqual(order.toSorted((a, b) => a - b));
    }
  });

  it("ordena por position aunque los productos lleguen desordenados", () => {
    const email = buildAlertEmail({ ...ALERT, products: ALERT.products.toReversed() });
    expect(email.text.indexOf("Kingston NV3 2 TB")).toBeLessThan(email.text.indexOf("Samsung 990"));
  });

  it("marca bajadas y subidas con precio anterior y nuevo, y los nuevos con 'Nuevo'", () => {
    const { html, text } = buildAlertEmail(ALERT);
    expect(html).toContain("<s>$420.000</s>");
    expect(html).toContain("↓ $400.889");
    expect(html).toContain("<s>$430.000</s>");
    expect(html).toContain("↑ $450.000");
    expect(html).toContain("Nuevo");

    const line = (name: string) => text.split("\n").find((l) => l.includes(name))!;
    expect(line("A-DATA XPG")).toContain("$420.000 → $400.889 ↓");
    expect(line("WD Black")).toContain("$430.000 → $450.000 ↑");
    expect(line("Kingston NV3 2 TB")).toContain("(Nuevo)");
    expect(line("Samsung 990")).not.toMatch(/[↓↑]/);
  });

  it("escapa HTML en textos del usuario y de SoloTodo", () => {
    const [first, ...rest] = ALERT.products;
    const email = buildAlertEmail({
      ...ALERT,
      label: "SSD <b>&</b>",
      products: [{ ...first, name: 'Disco "X" <script>' }, ...rest],
    });
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
        subject: "Hubo cambios de precio en SSD 2TB",
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

- [ ] **Step 2: Replace the alert tests in `tests/check-prices.test.ts`**

Replace the whole `describe("checkPrices: comparación y alertas", …)` block with:

```ts
describe("checkPrices: comparación y alertas", () => {
  const LISTING_URL = "https://www.solotodo.cl/ssd-m2-pcie-nvme";

  it("cron + baja de precio: inserta el registro y envía el email con la lista", async () => {
    const { deps, repo, sendAlert } = setup({
      checks: [previousCheck()],
      previousProducts: [product({ normalPrice: 420000 })],
    });

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
      listingUrl: LISTING_URL,
      products: [{ ...product(), previousNormalPrice: 420000, kind: "down" }],
    });
  });

  it("cron + subida de precio: también envía email", async () => {
    const { deps, sendAlert } = setup({
      checks: [previousCheck()],
      previousProducts: [product({ normalPrice: 390000 })],
    });
    const summary = await checkPrices(deps, { source: "cron" });
    expect(summary.alerts).toBe(1);
    expect(sendAlert).toHaveBeenCalledWith(
      expect.objectContaining({ products: [{ ...product(), previousNormalPrice: 390000, kind: "up" }] }),
    );
  });

  it("cron + mismo precio: inserta sin email", async () => {
    const { deps, repo, sendAlert } = setup({ checks: [previousCheck()], previousProducts: [product()] });
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

  it("chequeo anterior sin productos (previo a la migración): inserta sin email", async () => {
    const { deps, repo, sendAlert } = setup({ checks: [previousCheck({ normalPrice: 420000 })] });
    const summary = await checkPrices(deps, { source: "cron" });
    expect(summary).toEqual({ checked: 1, failed: 0, alerts: 0 });
    expect(repo.checks).toHaveLength(2);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("manual + baja de precio: inserta con source manual y nunca envía email", async () => {
    const { deps, repo, sendAlert } = setup({
      checks: [previousCheck()],
      previousProducts: [product({ normalPrice: 420000 })],
    });
    const summary = await checkPrices(deps, { source: "manual", trackedUrlId: 1 });
    expect(summary).toEqual({ checked: 1, failed: 0, alerts: 0 });
    expect(repo.checks.at(-1)?.source).toBe("manual");
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("un refresh manual que ya vio la baja hace que el cron siguiente no envíe email", async () => {
    const { deps, sendAlert } = setup({
      checks: [previousCheck()],
      previousProducts: [product({ normalPrice: 420000 })],
    });
    await checkPrices(deps, { source: "manual", trackedUrlId: 1 });
    await checkPrices(deps, { source: "cron" });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("avisa aunque cambie un producto que no es el más barato, y lista todos", async () => {
    const wd = { productId: 2, name: "WD Black 2 TB", slug: "wd-black", offerPrice: 440000 };
    const { deps, sendAlert } = setup({
      checks: [previousCheck()],
      entries: [entry(), entry({ ...wd, normalPrice: 450000 })],
      previousProducts: [product(), product({ ...wd, normalPrice: 460000, position: 1 })],
    });
    await checkPrices(deps, { source: "cron" });
    expect(sendAlert).toHaveBeenCalledWith({
      label: "SSD 2TB",
      listingUrl: LISTING_URL,
      products: [
        { ...product(), previousNormalPrice: 400889, kind: "same" },
        { ...product({ ...wd, normalPrice: 450000, position: 1 }), previousNormalPrice: 460000, kind: "down" },
      ],
    });
  });

  it("un producto nuevo más barato no dispara email", async () => {
    const { deps, repo, sendAlert } = setup({
      checks: [previousCheck()],
      entries: [entry({ productId: 999, name: "Kingston NV3 2 TB", slug: "kingston-nv3", normalPrice: 300000 }), entry()],
      previousProducts: [product()],
    });
    await checkPrices(deps, { source: "cron" });
    expect(repo.checks.at(-1)).toMatchObject({ productId: 999, normalPrice: 300000 });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("un producto que desaparece no dispara email", async () => {
    const { deps, sendAlert } = setup({
      checks: [previousCheck()],
      entries: [entry()],
      previousProducts: [product(), product({ productId: 2, normalPrice: 500000, position: 1 })],
    });
    await checkPrices(deps, { source: "cron" });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("si hay cambios, la lista no incluye los productos desaparecidos", async () => {
    const { deps, sendAlert } = setup({
      checks: [previousCheck()],
      entries: [entry()],
      previousProducts: [product({ normalPrice: 420000 }), product({ productId: 2, normalPrice: 500000, position: 1 })],
    });
    await checkPrices(deps, { source: "cron" });
    expect(sendAlert.mock.calls[0][0].products.map((p) => p.productId)).toEqual([127681]);
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
```

Also update two tests in the other `describe` blocks:

In `"si falla la consulta de ofertas: tienda null, se loguea, y la alerta se envía igual"`, change the setup to
`setup({ checks: [previousCheck()], previousProducts: [product({ normalPrice: 420000 })] })`
and replace
`expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({ storeName: null, storeUrl: null }));`
with
`expect(sendAlert).toHaveBeenCalledTimes(1);`

In `"si el email falla: el registro queda, se loguea y no lanza"`, change the setup to
`setup({ checks: [previousCheck()], previousProducts: [product({ normalPrice: 420000 })] })`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/check-prices.test.ts tests/email.test.ts`
Expected: FAIL, for example the email subject is still "Bajó de precio…" and `sendAlert` gets the old `PriceDropAlert` shape.

- [ ] **Step 4: Rewrite `src/lib/email.ts`**

```ts
import { formatCLP } from "./format";
import { productUrl } from "./solotodo";
import type { PriceChangeAlert, ProductChange } from "./types";

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

const MARK = {
  down: { symbol: "↓", color: "#15803d" },
  up: { symbol: "↑", color: "#dc2626" },
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function changed(p: ProductChange): p is ProductChange & { kind: "down" | "up"; previousNormalPrice: number } {
  return (p.kind === "down" || p.kind === "up") && p.previousNormalPrice !== null;
}

function priceHtml(p: ProductChange): string {
  const current = formatCLP(p.normalPrice);
  if (changed(p)) {
    const { symbol, color } = MARK[p.kind];
    return `<s>${formatCLP(p.previousNormalPrice)}</s> → <strong style="color:${color}">${symbol} ${current}</strong>`;
  }
  return p.kind === "new" ? `${current} <em>Nuevo</em>` : current;
}

function priceText(p: ProductChange): string {
  const current = formatCLP(p.normalPrice);
  if (changed(p)) return `${formatCLP(p.previousNormalPrice)} → ${current} ${MARK[p.kind].symbol}`;
  return p.kind === "new" ? `${current} (Nuevo)` : current;
}

export function buildAlertEmail(alert: PriceChangeAlert): EmailMessage {
  const products = alert.products.toSorted((a, b) => a.position - b.position);

  const rows = products.map((p) => {
    const url = escapeHtml(productUrl(p.productId, p.slug));
    return `<tr><td><a href="${url}">${escapeHtml(p.name)}</a></td><td>${priceHtml(p)}</td><td>${formatCLP(p.offerPrice)}</td></tr>`;
  });
  const html = [
    `<p><strong>${escapeHtml(alert.label)}</strong> · <a href="${escapeHtml(alert.listingUrl)}">ver listado</a></p>`,
    `<table cellpadding="6" style="border-collapse:collapse">`,
    `<thead><tr><th align="left">Producto</th><th align="left">Precio normal</th><th align="left">Con medio de pago específico</th></tr></thead>`,
    `<tbody>`,
    ...rows,
    `</tbody>`,
    `</table>`,
  ].join("\n");

  const text = [
    alert.label,
    `Listado: ${alert.listingUrl}`,
    "",
    ...products.map(
      (p) =>
        `${p.name}: ${priceText(p)} · ${formatCLP(p.offerPrice)} con medio de pago específico · ${productUrl(p.productId, p.slug)}`,
    ),
  ].join("\n");

  return { subject: `Hubo cambios de precio en ${alert.label}`, html, text };
}

export function createAlertSender(resend: ResendLike, config: { to: string; from: string }) {
  return async function sendAlert(alert: PriceChangeAlert): Promise<void> {
    const { error } = await resend.emails.send({
      from: config.from,
      to: config.to,
      ...buildAlertEmail(alert),
    });
    if (error) throw new Error(`Resend rechazó el envío: ${error.message}`);
  };
}
```

- [ ] **Step 5: Update the alert logic in `src/lib/check-prices.ts`**

Imports:

```ts
import { diffProducts, hasPriceChanges, toCheckProducts } from "./product-changes";
import type { SolotodoClient } from "./solotodo";
import type {
  CheckProduct,
  CheckSource,
  NewPriceCheck,
  PriceChangeAlert,
  PriceCheck,
  StoreOffer,
  TrackedUrl,
} from "./types";
```

In `CheckDeps`: `sendAlert(alert: PriceChangeAlert): Promise<void>;`

In `checkOne`, read the previous products before inserting and replace the alert section. From `const previous = …` to the end of the function:

```ts
  const previous = await deps.repo.getLastCheck(tracked.id);
  const previousProducts = previous ? await deps.repo.getCheckProducts(previous.id) : [];
  await deps.repo.insertCheck(
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

  // Sin productos anteriores (primer chequeo o chequeo previo a la migración) no hay con qué comparar
  if (source !== "cron" || previousProducts.length === 0) return false;
  const changes = diffProducts(products, previousProducts);
  if (!hasPriceChanges(changes)) return false;

  try {
    await deps.sendAlert({ label: tracked.label, listingUrl: tracked.url, products: changes });
    return true;
  } catch (error) {
    deps.logError(`No se pudo enviar la alerta de "${tracked.label}"`, error);
    return false;
  }
}
```

- [ ] **Step 6: Remove `PriceDropAlert` from `src/lib/types.ts`**

Delete the whole `export interface PriceDropAlert { … }` block.

Run: `grep -rn "PriceDropAlert" src tests scripts`
Expected: no output. (`src/lib/deps.ts` needs no change: its `sendAlert` arrow gets its type from `CheckDeps`.)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/check-prices.test.ts tests/email.test.ts`
Expected: PASS.

- [ ] **Step 8: Update `README.md` line 4**

Replace:

`Cada día guarda el precio normal del producto más barato de cada listado y envía un email si bajó.`

with:

`Cada día guarda todos los productos de cada listado (destacando el más barato) y envía un email si alguno cambió de precio normal.`

- [ ] **Step 9: Full check and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

```bash
git add src/lib/check-prices.ts src/lib/email.ts src/lib/types.ts tests/check-prices.test.ts tests/email.test.ts README.md
git commit -m "feat: email when any listing product changes price"
```

---

### Task 6: Dashboard data with products

**Files:**
- Modify: `src/lib/dashboard.ts`, `src/app/page.tsx`
- Test: `tests/dashboard.test.ts`

**Interfaces:**
- Consumes: `diffProducts` (Task 3), `CheckProduct`, `ProductChange` (Task 3), `listProductsForChecks` (Task 4).
- Produces:
  - `DashboardRow.products: ProductChange[]`: products of the latest check compared with the one before it, ordered by `position`; `[]` when the latest check has no products.
  - `buildDashboardRows(urls: TrackedUrl[], checks: PriceCheck[], productsByCheck: Map<number, CheckProduct[]>): DashboardRow[]`
  - `recentCheckIds(checks: PriceCheck[], perUrl?: number): number[]` (default `perUrl = 2`).

- [ ] **Step 1: Update `tests/dashboard.test.ts`**

Change the imports to:

```ts
import { HISTORY_POINTS, buildDashboardRows, recentCheckIds, sparklinePoints } from "@/lib/dashboard";
import type { CheckProduct, PriceCheck, TrackedUrl } from "@/lib/types";
```

Add `new Map()` as the third argument to the five existing `buildDashboardRows(…)` calls (in "agrupa por URL…", both calls in "tendencia up y same", "URL sin chequeos" and "limita el histórico…"). In "URL sin chequeos", add `products: []` to the `toMatchObject` object.

After the `check` helper, add:

```ts
const product = (productId: number, normalPrice: number, position: number): CheckProduct => ({
  productId,
  name: `P${productId}`,
  slug: `p${productId}`,
  normalPrice,
  offerPrice: normalPrice - 1000,
  position,
});
```

Append these blocks before `describe("sparklinePoints", …)`:

```ts
describe("buildDashboardRows: productos", () => {
  it("compara los productos del último chequeo contra el penúltimo", () => {
    const older = check(1, 1, 100);
    const newer = check(1, 2, 90);
    const products = new Map([
      [older.id, [product(1, 100, 0), product(2, 200, 1), product(3, 300, 2)]],
      [newer.id, [product(1, 90, 0), product(4, 150, 1), product(2, 200, 2)]],
    ]);
    const [row] = buildDashboardRows([url(1)], [newer, older], products);
    expect(row.products.map((p) => [p.productId, p.kind, p.previousNormalPrice])).toEqual([
      [1, "down", 100],
      [4, "new", null],
      [2, "same", 200],
    ]);
  });

  it("si el penúltimo chequeo no tiene productos, no marca cambios", () => {
    const older = check(1, 1, 100);
    const newer = check(1, 2, 90);
    const [row] = buildDashboardRows([url(1)], [older, newer], new Map([[newer.id, [product(1, 90, 0)]]]));
    expect(row.products).toEqual([{ ...product(1, 90, 0), previousNormalPrice: null, kind: "same" }]);
  });

  it("si el último chequeo no tiene productos (histórico), la lista queda vacía", () => {
    const older = check(1, 1, 100);
    const newer = check(1, 2, 90);
    const [row] = buildDashboardRows([url(1)], [older, newer], new Map([[older.id, [product(1, 100, 0)]]]));
    expect(row.products).toEqual([]);
  });
});

describe("recentCheckIds", () => {
  it("devuelve los dos últimos chequeos de cada URL, sin importar el orden de entrada", () => {
    const a1 = check(1, 1, 100);
    const a2 = check(1, 2, 100);
    const a3 = check(1, 3, 100);
    const b1 = check(2, 1, 100);
    expect(recentCheckIds([a3, b1, a1, a2]).toSorted((x, y) => x - y)).toEqual(
      [a2.id, a3.id, b1.id].toSorted((x, y) => x - y),
    );
  });

  it("sin chequeos", () => {
    expect(recentCheckIds([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/dashboard.test.ts`
Expected: FAIL, `recentCheckIds` is not exported and `row.products` is undefined.

- [ ] **Step 3: Update `src/lib/dashboard.ts`**

Replace everything from the top of the file down to the end of `buildDashboardRows` (keep `round2` and `sparklinePoints` as they are):

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Load the products in `src/app/page.tsx`**

Change the imports and the data loading:

```ts
import { buildDashboardRows, recentCheckIds } from "@/lib/dashboard";
import { listAllChecks, listProductsForChecks, listTrackedUrls } from "@/lib/db/repo";
```

```ts
  const [urls, checks] = await Promise.all([listTrackedUrls(), listAllChecks()]);
  const productsByCheck = await listProductsForChecks(recentCheckIds(checks));
  const rows = buildDashboardRows(urls, checks, productsByCheck);
```

- [ ] **Step 6: Full check and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

```bash
git add src/lib/dashboard.ts src/app/page.tsx tests/dashboard.test.ts
git commit -m "feat: load listing products into dashboard rows"
```

---

### Task 7: Products accordion and change badges in the UI

**Files:**
- Create: `src/components/dashboard/product-change-badge.tsx`, `src/components/dashboard/other-products.tsx`
- Modify: `src/components/dashboard/tracked-url-row.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: `DashboardRow.products` (Task 6); shadcn `Accordion*`, `Table*`, `Badge`, `CardContent` (Task 2); `productUrl(productId, slug)` from `@/lib/solotodo`; `formatCLP` from `@/lib/format`.
- Produces: `ProductChangeBadge({ change: ProductChange })`, `OtherProducts({ products: ProductChange[] })`.

- [ ] **Step 1: Create `src/components/dashboard/product-change-badge.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import { formatCLP } from "@/lib/format";
import type { ProductChange } from "@/lib/types";

export function ProductChangeBadge({ change }: { change: ProductChange }) {
  if (change.kind === "new") return <Badge variant="outline">Nuevo</Badge>;
  if (change.kind === "same" || change.previousNormalPrice === null) return null;

  const diff = formatCLP(Math.abs(change.normalPrice - change.previousNormalPrice));
  return change.kind === "down" ? (
    <Badge variant="outline" className="border-green-300 text-green-700 dark:border-green-800 dark:text-green-400">
      ↓ bajó {diff}
    </Badge>
  ) : (
    <Badge variant="outline" className="border-red-300 text-red-700 dark:border-red-800 dark:text-red-400">
      ↑ subió {diff}
    </Badge>
  );
}
```

- [ ] **Step 2: Create `src/components/dashboard/other-products.tsx`**

```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCLP } from "@/lib/format";
import { productUrl } from "@/lib/solotodo";
import type { ProductChange } from "@/lib/types";
import { ProductChangeBadge } from "./product-change-badge";

const linkClass = "underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-current";

export function OtherProducts({ products }: { products: ProductChange[] }) {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="others" className="border-b-0">
        <AccordionTrigger className="py-2 text-sm">
          Ver {products.length} {products.length === 1 ? "producto" : "productos"} más
        </AccordionTrigger>
        <AccordionContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Precio normal</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Medio de pago específico</TableHead>
                <TableHead>
                  <span className="sr-only">Cambio</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.position}>
                  <TableCell>
                    <div className="max-w-[16rem] truncate">
                      <a href={productUrl(p.productId, p.slug)} target="_blank" rel="noreferrer" className={linkClass}>
                        {p.name}
                      </a>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCLP(p.normalPrice)}</TableCell>
                  <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                    {formatCLP(p.offerPrice)}
                  </TableCell>
                  <TableCell className="text-right">
                    <ProductChangeBadge change={p} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
```

- [ ] **Step 3: Render the accordion in `src/components/dashboard/tracked-url-row.tsx`**

Add the import:

```tsx
import { OtherProducts } from "./other-products";
```

Destructure `products` too and compute the rest of the list:

```tsx
  const { tracked, latest, previous, trend, productUrl, history, products } = row;
  const needsReview = tracked.status === "needs_review";
  const others = products.filter((p) => p.position > 0);
```

Right after the closing `</CardContent>` of the main content (before `</Card>`), add:

```tsx
        {others.length > 0 && (
          <CardContent>
            <OtherProducts products={others} />
          </CardContent>
        )}
```

(When the latest check is historical, `products` is `[]` and no accordion is shown. The main product still comes from `latest`, the `price_checks` row, which is the same product as `position = 0`.)

- [ ] **Step 4: Update the subtitle in `src/app/page.tsx`**

Replace `Precio normal del producto más barato de cada listado. Revisión automática una vez al día.` with `Productos de cada listado, con el más barato destacado. Revisión automática una vez al día.`

- [ ] **Step 5: Checks**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 6: Visual check**

Run `npm run dev` and open http://localhost:3000. Expected: URLs whose last check has several products show "Ver N productos más". It opens and closes, lists the products with price and badge, and the offer-price column hides on narrow screens. URLs with only historical checks show only the card. If the migration was not applied (Task 4, Step 9), the page fails because `url_check_products` does not exist: report that to the user instead of working around it. Stop the dev server afterwards.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/ src/app/page.tsx
git commit -m "feat: show all listing products in a dashboard accordion"
```

---

### Task 8: End-to-end verification (with the user)

**Files:** none (only verification). If something fails, go back to the task that owns the code.

- [ ] **Step 1: Full suite**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 2: Confirm the migration is applied**

If the user did not approve `npm run db:migrate` in Task 4, ask again now. Without it, the remaining steps cannot run.

- [ ] **Step 3: End-to-end run (only with the user's OK, because it can send a real email)**

Ask the user and, if they agree:
1. Run `npm run check-prices` once. Expected output: `check-prices {"checked":N,"failed":0,"alerts":0}`. The previous checks have no products, so there is no email.
2. Ask the user to change one product's `normal_price` in the latest check's rows of `url_check_products` (for example with the Supabase SQL editor: `UPDATE url_check_products SET normal_price = normal_price + 1000 WHERE price_check_id = <last id> AND position = 1;`).
3. Run `npm run check-prices` again. Expected: `"alerts":1` for that URL, and an email titled "Hubo cambios de precio en <label>" listing all products, with the changed one marked ↓ against its original price.
4. Open the dashboard with `npm run dev`: the accordion shows the product with the "↓ bajó $1.000" badge.

- [ ] **Step 4: Report**

Summarize for the user what was verified and what was not (for example if they declined the real run).
