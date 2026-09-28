# Refactor: src/ + shadcn/ui + Todos los productos del listado

## Contexto

La app actual (`solotodo-tracker`) tiene una arquitectura sin carpeta `src/`, componentes Tailwind planos, y guarda solo el producto más barato de cada listado. Este refactor la adapta a una estructura más mantenible y rica en información.

## Goals

1. Mover el código de la aplicación (`app/`, `lib/`) a `src/` (Next.js 16 + App Router).
2. Migrar componentes Tailwind planos a shadcn/ui (Radix + Tailwind).
3. Guardar **todos los productos de la primera página** que devuelve `browse` en cada chequeo, no solo el más barato.
4. Mostrar el producto más barato destacado en el dashboard, con el resto en un accordion desplegable.
5. Enviar un email cuando **cualquier producto** presente en el chequeo actual y en el anterior cambie de `normal_price` (sube o baja), señalando cuáles cambiaron.

## Non-Goals

- No cambiar la API pública de SoloTodo.
- No agregar autenticación al dashboard.
- No cambiar el cron local (LaunchAgent) ni la config de Vercel. Por eso `scripts/` se queda en la raíz.
- No paginar `browse`: solo se considera la primera página.
- No guardar tienda por producto: la tienda sigue existiendo solo para el más barato (en `price_checks`).
- No alertar por cambios de `offer_price`.

## Architecture

### Estructura de carpetas

Solo el código de la app se mueve a `src/`. Todo lo operativo queda en la raíz.

```
src/
├── app/                    # App Router (antes ./app)
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── favicon.ico
│   └── api/
├── components/
│   ├── dashboard/          # Componentes de página (antes ./app/components)
│   │   ├── add-url-form.tsx
│   │   ├── row-actions.tsx
│   │   ├── sparkline.tsx
│   │   └── tracked-url-row.tsx
│   └── ui/                 # shadcn/ui (generado por CLI)
│       ├── accordion.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       └── table.tsx
└── lib/                    # Lógica de dominio (antes ./lib)
    ├── types.ts
    ├── format.ts
    ├── solotodo.ts
    ├── resolve-url.ts
    ├── check-prices.ts
    ├── email.ts
    ├── dashboard.ts
    ├── deps.ts
    ├── utils.ts            # `cn()`, generado por shadcn init
    └── db/
        ├── schema.ts
        ├── index.ts
        └── repo.ts

scripts/                    # Sin mover (el LaunchAgent apunta a scripts/check-prices.ts)
tests/                      # Sin mover
drizzle/                    # Sin mover
public/                     # Sin mover
```

`scripts/check-prices.ts` cambia sus imports relativos (`../lib/...` → `../src/lib/...`). `install-launchd.sh` y la ruta del plist no cambian, así que no hace falta reinstalar el LaunchAgent.

### Base de datos

**Nueva tabla `url_check_products`:**

```sql
CREATE TABLE "url_check_products" (
  "id" serial PRIMARY KEY NOT NULL,
  "price_check_id" integer NOT NULL REFERENCES "price_checks"("id") ON DELETE cascade,
  "product_id" integer NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "normal_price" integer NOT NULL,
  "offer_price" integer NOT NULL,
  "position" integer NOT NULL,
  CONSTRAINT "url_check_products_check_position_unique" UNIQUE ("price_check_id", "position")
);
CREATE INDEX "url_check_products_price_check_id_idx" ON "url_check_products" ("price_check_id");
```

Se define en `src/lib/db/schema.ts` con Drizzle y la migración se genera con `npm run db:generate`.

**Tabla `price_checks` existente:** sin cambios. Sigue siendo el resumen del chequeo (el más barato + su tienda) y la fuente de la sparkline.

### Tipos nuevos (`src/lib/types.ts`)

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
  previousNormalPrice: number | null; // null si kind === "new"
  kind: ProductChangeKind;
}

export interface PriceChangeAlert {
  label: string;
  listingUrl: string;
  products: ProductChange[]; // ordenados por position
}
```

`PriceDropAlert` se elimina y lo reemplaza `PriceChangeAlert`.

### Repositorio (`PriceRepo`)

```ts
export interface PriceRepo {
  listCheckableUrls(): Promise<TrackedUrl[]>;
  getTrackedUrl(id: number): Promise<TrackedUrl | null>;
  getLastCheck(trackedUrlId: number): Promise<PriceCheck | null>;
  getCheckProducts(priceCheckId: number): Promise<CheckProduct[]>;
  insertCheck(check: NewPriceCheck, products: CheckProduct[]): Promise<PriceCheck>;
}
```

- `insertCheck` inserta `price_checks` y todas sus filas de `url_check_products` en **una sola transacción**.
- Para el dashboard, una función aparte: `listProductsForChecks(checkIds: number[]): Promise<Map<number, CheckProduct[]>>`.

### Lógica de chequeo (`checkPrices`)

1. `browse(categoryId, params)` devuelve los productos de la primera página (ya lo hace).
2. Se **ordenan en código** por `normalPrice` ascendente y se asigna `position` según ese orden. No se confía en el orden de la API, que ordena por `normal_price_usd` y podría no coincidir con el precio en CLP. Con esto, el producto con `position = 0` es siempre el mismo que se guarda en `price_checks`.
3. Se busca la tienda del producto con `position = 0` (igual que hoy).
4. Se leen el chequeo anterior (`getLastCheck`) y sus productos (`getCheckProducts`) **antes** de insertar el nuevo.
5. `insertCheck(resumen, productos)`.
6. Se construye `ProductChange[]` comparando por **`product_id`** contra los productos del chequeo anterior:
   - Está en ambos y el `normalPrice` bajó → `down`; subió → `up`; igual → `same`.
   - Está solo en el actual → `new` (se muestra, **no dispara email**).
   - Está solo en el anterior (desapareció) → **se ignora**: no aparece en la lista ni dispara email.
7. Se envía el email solo si se cumple todo esto:
   - `source === "cron"` (los refrescos manuales nunca alertan, igual que hoy).
   - El chequeo anterior existe y **tiene productos**. Los chequeos históricos previos a la migración no tienen filas en `url_check_products`, así que el primer chequeo después de la migración no alerta.
   - Hay al menos un producto con `kind` `down` o `up`.
8. `CheckSummary.alerts` cuenta los emails enviados (uno por URL como máximo).

Hay un caso borde aceptado: si el producto más barato desaparece, el mínimo del listado sube, pero no se alerta, porque ningún producto presente en ambos chequeos cambió de precio.

### Dashboard

- `page.tsx` obtiene URLs y chequeos (como hoy). Toma los IDs de los **dos últimos** chequeos por URL y llama a `listProductsForChecks`.
- `buildDashboardRows(urls, checks, productsByCheck)` sigue siendo una función pura. Agrega a `DashboardRow`:
  - `products: ProductChange[]`: productos del último chequeo, comparados contra el penúltimo con la misma regla que el chequeo. Si el penúltimo no tiene productos, todos van con `kind: "same"` y `previousNormalPrice: null`, sin badge.
- `TrackedUrlRow` renderiza:
  - El producto con `position = 0` como tarjeta principal (`Card`): nombre, precio, tienda y sparkline, igual que hoy.
  - Si hay más de un producto, un `Accordion` titulado "Ver N productos más" con el resto (`position > 0`) en una `Table` compacta: nombre (con link a la ficha), precio normal, precio con medio de pago y badge.
  - Badges por producto: `↓ bajó $X` (verde), `↑ subió $X` (rojo), `Nuevo` (neutro). Sin badge si `same`.
- Si el último chequeo no tiene productos (histórico), se muestra solo la tarjeta principal desde `price_checks`, sin accordion.

### Email

- `buildAlertEmail(alert: PriceChangeAlert)` y `createAlertSender` reciben el alert nuevo.
- Asunto: `Hubo cambios de precio en <label>`.
- HTML: tabla con todos los productos ordenados por `position`, con nombre (link a la ficha), precio normal y precio con medio de pago.
  - En los productos `down` o `up`, el precio va como `<s>anterior</s> → nuevo`, con una flecha ↓ en verde o ↑ en rojo.
  - Los productos `new` llevan la etiqueta "Nuevo".
- Texto plano equivalente, con una línea por producto y la marca ↓/↑ en los que cambiaron.
- Incluye un link al listado (`listingUrl`).

## Componentes shadcn/ui a instalar

- `accordion` → lista desplegable de productos
- `button` → acciones del dashboard
- `badge` → estados (Pausada, Revisión pendiente, cambio de precio, Nuevo)
- `card` → producto principal
- `input` → formulario de alta
- `table` → lista de productos dentro del accordion

Tooltip queda fuera. "Revisión pendiente" mantiene su atributo `title` nativo.

Notas de `shadcn init`:
- Crea `components.json` con los aliases `@/components` y `@/lib/utils`, y el archivo `src/lib/utils.ts`.
- Reescribe `src/app/globals.css` con sus variables CSS, lo que cambia la paleta. Se aceptan los colores por defecto de shadcn (base neutral), manteniendo el dark mode por `prefers-color-scheme`.
- Si el CLI no soporta Next 16 o Tailwind v4, se instalan los componentes a mano desde el registry.

## Configuración

- `tsconfig.json`: `paths: { "@/*": ["./src/*"] }`. `include` sigue con `**/*.ts` y cubre `scripts/` y `tests/`.
- `vitest.config.ts`: alias `@/` → `./src/`, y `include` sigue siendo `tests/**/*.test.ts`.
- `drizzle.config.ts`: schema `"./src/lib/db/schema.ts"` (el `out` sigue en `./drizzle`).
- `package.json`: sin cambios (`check-prices` sigue apuntando a `scripts/check-prices.ts`).
- `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vercel.json`: sin cambios.

## Tests

Todos los tests usan repos y clientes mockeados. No se agrega una base de datos de test.

- Los imports `@/...` de los tests existentes siguen funcionando gracias al alias. Solo cambian los que apuntan a `@/app/components` (→ `@/components/dashboard`).
- Tests que cambian de semántica:
  - `tests/check-prices.test.ts`: `insertCheck` recibe los productos ordenados con su `position`; la alerta se dispara con subidas y bajadas; no alerta con `source: "manual"`, ni sin chequeo anterior, ni si el anterior no tiene productos, ni por productos solo nuevos o desaparecidos; y el más barato se calcula por precio en CLP aunque la API devuelva otro orden.
  - `tests/email.test.ts`: reemplazado por el formato multi-producto (asunto, tabla, marcas ↓/↑, "Nuevo", escape de HTML).
  - `tests/dashboard.test.ts`: `products` con `kind` correcto, dashboard sin accordion para chequeos históricos sin productos.
- Test nuevo: `tests/product-changes.test.ts`, para la función pura que compara productos (`diffProducts(current, previous)`), compartida entre el chequeo y el dashboard.

## Plan de migración

### Paso 1a: Mover a `src/` (commit propio, sin cambios de comportamiento)
- Mover `app/` → `src/app/`, `lib/` → `src/lib/` y `app/components/` → `src/components/dashboard/`.
- Actualizar `tsconfig.json`, `vitest.config.ts` y `drizzle.config.ts`, y los imports de `scripts/check-prices.ts`.
- Verificar: `npm test`, `npm run typecheck`, `npm run build`, `npm run check-prices` (en local).

### Paso 1b: shadcn/ui (commit propio)
- `npx shadcn@latest init` e instalar los componentes listados.
- Reemplazar los componentes planos por shadcn/ui, sin cambiar funcionalidad.
- Verificar: typecheck, build y revisión visual con `npm run dev`.

### Paso 2: Guardar todos los productos
- Agregar la tabla `url_check_products` al schema, y generar y aplicar la migración.
- Agregar `diffProducts` y los tipos nuevos.
- Modificar `PriceRepo` (`insertCheck` transaccional, `getCheckProducts`, `listProductsForChecks`).
- Modificar `checkPrices` (orden en código, inserción de productos, regla de alerta nueva).
- Verificar con tests.

### Paso 3: Dashboard + email multi-producto
- Actualizar `buildDashboardRows` y `page.tsx`.
- Implementar la tarjeta, el accordion, la tabla y los badges en `TrackedUrlRow`.
- Reemplazar `buildAlertEmail` por el formato multi-producto.
- Verificar end-to-end: correr `npm run check-prices` dos veces y revisar el dashboard y el email (forzando un cambio de precio en la base de datos local).

## Riesgos

- **Path aliases**: `vitest`, Next.js y `tsx` (en scripts, con imports relativos) deben resolver bien. Se verifica en el Paso 1a antes de tocar la UI.
- **shadcn + Next.js 16 / Tailwind v4**: el CLI podría no soportar la versión actual. En ese caso, instalación manual.
- **Cambio visual**: `shadcn init` reemplaza la paleta de `globals.css`.
- **Migración de datos**: los chequeos históricos no tienen `url_check_products`. Se muestran sin accordion y el primer chequeo después de la migración no alerta.
- **Emails más frecuentes**: ahora también alertan las subidas de cualquier producto del listado. Se acepta como comportamiento buscado.
