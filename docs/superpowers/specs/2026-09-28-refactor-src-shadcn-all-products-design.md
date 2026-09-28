# Refactor: src/ + shadcn/ui + Todos los productos del listado

## Contexto

La app actual (`solotodo-tracker`) tiene una arquitectura sin carpeta `src/`, componentes Tailwind planos, y guarda solo el producto más barato de cada listado. Este refactor la adapta a una estructura más mantenible y rica en información.

## Goals

1. Mover todo el código a `src/` (Next.js 16 + App Router).
2. Migrar componentes Tailwind planos a shadcn/ui (Radix + Tailwind).
3. Guardar **todos los productos** del listado en cada chequeo, no solo el más barato.
4. Mostrar el producto más barato destacado en el dashboard, con el resto en un accordion desplegable.
5. Enviar un email cuando **cualquier producto** del listado cambie de `normal_price`, señalando cuáles cambiaron.

## Non-Goals

- No cambiar la API pública de SoloTodo.
- No agregar autenticación al dashboard.
- No cambiar el cron local ni la config de Vercel.

## Architecture

### Estructura de carpetas

```
src/
├── app/                    # App Router (antes ./app)
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── api/
│   └── components/         # Componentes de página (dashboard)
├── lib/                    # Lógica de dominio (antes ./lib)
│   ├── types.ts
│   ├── format.ts
│   ├── solotodo.ts
│   ├── resolve-url.ts
│   ├── check-prices.ts
│   ├── email.ts
│   ├── dashboard.ts
│   ├── deps.ts
│   └── db/
│       ├── schema.ts
│       ├── index.ts
│       └── repo.ts
├── components/             # shadcn/ui (generado por CLI)
│   └── ui/
│       ├── accordion.tsx
│       ├── button.tsx
│       ├── badge.tsx
│       ├── card.tsx
│       ├── input.tsx
│       └── ...
├── scripts/
│   ├── check-prices.ts
│   └── install-launchd.sh
└── tests/
```

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
  "position" integer NOT NULL
);
```

**Tabla `price_checks` existente:** sin cambios.

### Lógica de chequeo (`checkPrices`)

1. `browse(categoryId, params)` devuelve todos los productos de la primera página (ya lo hace).
2. Por cada producto, insertar una fila en `url_check_products` con `position` = índice en el array (0 = más barato).
3. El registro `price_checks` sigue existiendo para guardar el producto más barato (resumen del chequeo).
4. Comparar cada producto del chequeo actual contra el **chequeo anterior** (por `trackedUrlId`):
   - Si algún `normalPrice` cambió (subió o bajó), enviar email.
5. El email incluye:
   - Lista completa ordenada por `position`.
   - Indicador visual (emoji/flecha) en los productos cuyo precio cambió.
   - Precio anterior vs nuevo para cada producto modificado.

### Dashboard

- `buildDashboardRows` obtiene el último `price_check` por URL, y hace JOIN con `url_check_products` para obtener todos los productos.
- `TrackedUrlRow` renderiza:
  - El producto en `position = 0` como tarjeta principal (nombre, precio, tienda, sparkline).
  - Un `<Accordion>` de shadcn/ui con el título "Ver N productos más" que muestra el resto (`position > 0`) como una tabla compacta.
- Cada producto en la lista tiene un badge si su precio cambió respecto al chequeo anterior.

### Email

- `buildAlertEmail` recibe ahora `ProductChange[]` en lugar de un solo producto.
- Incluye tabla HTML con todos los productos.
- Destaca en verde/rojo los productos que bajaron/subieron.

## Componentes shadcn/ui a instalar

- `accordion` → lista desplegable de productos
- `button` → acciones del dashboard
- `badge` → estados (Pausada, Revisión, cambio de precio)
- `card` → producto principal
- `input` → formulario de alta
- `table` → lista de productos dentro del accordion
- `tooltip` → info adicional

## Configuración

- `tsconfig.json`: `paths: { "@/*": ["./src/*"] }`
- `vitest.config.ts`: alias `@/` → `./src/`
- `drizzle.config.ts`: schema `"./src/lib/db/schema.ts"`
- `next.config.ts`: sin cambios

## Tests

- Adaptar todos los tests existentes al nuevo path `src/`.
- Nuevos tests:
  - `tests/db-schema.test.ts` (validar inserción de `url_check_products`).
  - `tests/check-prices-products.test.ts` (guardar múltiples productos, detectar cambios).
  - `tests/email-multi.test.ts` (email con lista de productos).

## Plan de migración

### Paso 1: Mover a `src/` + shadcn
- Crear `src/` y mover `app/`, `lib/`, `scripts/`.
- Actualizar paths en `tsconfig.json`, `vitest.config.ts`, `drizzle.config.ts`.
- `npx shadcn@latest init`.
- Reemplazar componentes planos por shadcn/ui (sin cambiar funcionalidad).
- Verificar: `npm test`, `npm run typecheck`, `npm run build`.

### Paso 2: Guardar todos los productos
- Crear tabla `url_check_products` en schema.
- Generar y aplicar migración Drizzle.
- Modificar `checkPrices` para insertar todos los productos.
- Modificar `PriceRepo` para leer productos de un chequeo.
- Verificar con tests.

### Paso 3: Dashboard + email multi-producto
- Actualizar `buildDashboardRows` para obtener todos los productos.
- Implementar accordion en `TrackedUrlRow`.
- Actualizar `buildAlertEmail` para listas de productos.
- Verificar end-to-end.

## Riesgos

- **Path aliases**: `vitest` y `Next.js` deben resolver `@/` a `src/`. Verificar en tests y build.
- **shadcn + Next.js 16**: el CLI debe soportar la versión actual. Si no, instalar manualmente.
- **Migración de datos**: los chequeos históricos no tendrán `url_check_products` (aceptable, solo afectan al dashboard).
