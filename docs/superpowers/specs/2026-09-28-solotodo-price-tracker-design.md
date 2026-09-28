# SoloTodo Price Tracker — Design

## Contexto y objetivo

SoloTodo (`solotodo.cl`) ya agrega productos, precios y stock de múltiples tiendas chilenas. Este proyecto agrega una capa personal de seguimiento sobre SoloTodo: el usuario registra URLs de listados filtrados de SoloTodo (ej. una búsqueda de SSDs con specs específicas), y la herramienta:

- Revisa una vez al día (cron) el producto más barato que cumple esos filtros.
- Guarda un historial de precio en el tiempo.
- Envía un email cuando el precio baja respecto al último registro.
- Permite un refresh manual desde un dashboard, sin generar notificación.

Uso personal, un solo usuario, sin autenticación de usuarios.

## Investigación previa (verificada contra la API real)

- `solotodo.cl` es un frontend sobre una API JSON pública y sin autenticación en `api.solotodo.com`.
- El endpoint de listados es `GET /categories/{category_id}/browse/?<params>`. Los query params de una URL de `solotodo.cl` mapean 1:1 a los de este endpoint. Ejemplo verificado: los params de la URL de SSDs aplicados a `/categories/39/browse/` devuelven 7 resultados, con el mismo producto y precio que muestra la web.
- El path de la URL del sitio (ej. `/ssd-m2-pcie-nvme`) **no** es un slug de categoría de la API: es una landing del sitio. Su configuración viene embebida en el HTML de la página: `category: 39` y parámetros implícitos (`format_families=1560421&base_buses=1559281`) que no aparecen en la URL.
- **La API ignora sin error los parámetros que no reconoce** y devuelve resultados sin filtrar (ej. `/products/browse/` con params inválidos devuelve el catálogo completo, ~39.000 productos de cualquier categoría). "Devolvió resultados" no sirve como validación.
- Cada resultado trae dos precios en CLP: `normal_price` (precio real/general) y `offer_price` (precio con un medio de pago específico, ej. efectivo/transferencia). La API acepta `ordering=normal_price_usd` y `ordering=offer_price_usd`.
- Estructura de respuesta: `results[]` (buckets, 10 por página) → `product_entries[0]` → `product` (`id`, `name`, `slug`, …) y `metadata.prices_per_currency[0]` (`normal_price`, `offer_price`). La tienda no viene en esta respuesta.
- Link a la ficha: `https://www.solotodo.cl/products/{id}-{slug}` (`/products/{id}` también redirige a la ficha).
- La tienda se obtiene con una llamada extra: `GET /products/{id}/entities/` devuelve un array con la oferta de cada tienda (`store` id, `external_url` a la página del producto en la tienda y `active_registry` con `is_available`, `normal_price`, `offer_price`). Muchas ofertas no están disponibles (en el ejemplo, 1 de 26). `GET /stores/` devuelve la lista completa de tiendas (368) con `id` y `name` en una sola llamada. Ejemplo verificado: la oferta disponible del SSD más barato es de MyShop, con los mismos precios que muestra `browse`.

## Alcance

- Cada `tracked_url` representa un **listado filtrado** de SoloTodo. Se trackea **el producto con menor `normal_price`** que cumple esos filtros en cada chequeo, no todos los productos del listado.
- Se guardan ambos precios (`normal_price` y `offer_price`), pero la comparación y las alertas usan **`normal_price`**.
- El stock no se trackea explícitamente: en `browse` solo aparecen productos con ofertas activas, así que "aparece en el listado" equivale a "hay stock en alguna tienda".
- La tienda con el menor `normal_price` se guarda **solo como dato informativo**: se muestra en el dashboard y en el email, pero no participa en la comparación, en las alertas ni en ninguna otra lógica. Si no se puede obtener, el chequeo continúa igual sin tienda.
- Fuera de alcance: URLs de ficha de producto individual y autenticación de usuarios. El modelo de datos permite agregar un histórico por producto más adelante (ver Modelo de datos).

## Stack técnico

- **Next.js 16** (App Router, carpeta `/app`, TypeScript).
- **Postgres** en dos etapas, con el mismo schema y las mismas migraciones Drizzle:
    - **Local:** Postgres 17 instalado con Homebrew (`postgresql@17`), base `solotodo_tracker`.
    - **Deploy (Vercel):** **Supabase** (Postgres gestionado). Pasar de uno a otro es cambiar `DATABASE_URL` y aplicar las migraciones; no hay cambios de código.
    - Driver `postgres` (postgres.js), que funciona igual contra el Postgres local y contra Supabase. Con `prepare: false` para ser compatible con el pooler de Supabase en modo transacción.
- **Drizzle ORM**.
- **Resend** para emails.
- **Vitest** para tests.

Variables de entorno: `DATABASE_URL`, `RESEND_API_KEY`, `ALERT_EMAIL`, `CRON_SECRET`.

## Arquitectura

```
solotodo-tracker/
├── app/
│   ├── page.tsx                       # Dashboard
│   └── api/
│       ├── tracked-urls/route.ts      # Alta, pausa/reactivación y borrado de URLs
│       └── check-prices/route.ts      # Wrapper HTTP de lib/check-prices
├── lib/
│   ├── db/                            # Schema Drizzle + conexión
│   ├── solotodo.ts                    # Cliente de api.solotodo.com (browse, entities, stores)
│   ├── resolve-url.ts                 # URL de solotodo.cl → { category_id, params }
│   ├── check-prices.ts                # Lógica de chequeo (sin dependencia de HTTP)
│   └── email.ts                       # Envío de alertas vía Resend
├── scripts/
│   └── check-prices.ts                # Entry point del cron local
└── vercel.json                        # Cron de Vercel (para el deploy futuro)
```

La lógica de chequeo vive en `lib/check-prices.ts` como una función `checkPrices({ source, trackedUrlId? })`. Se invoca desde dos lugares:

- **Cron local:** `launchd` de macOS ejecuta `tsx scripts/check-prices.ts` una vez al día, que llama `checkPrices({ source: "cron" })` directo. No necesita que `next dev` esté corriendo.
- **Ruta `/api/check-prices`:**
    - `GET` con header `Authorization: Bearer ${CRON_SECRET}` → `source: "cron"`. Es la forma en que llama Vercel Cron (siempre usa GET y envía ese header cuando `CRON_SECRET` está definido).
    - `POST` desde el dashboard con `{ trackedUrlId }` → `source: "manual"`.
    - El `source` se deduce del método y la autenticación, nunca de un parámetro del cliente, así que nadie puede disparar emails desde fuera sin el secreto.

## Modelo de datos

### `tracked_urls`

| campo         | tipo          | notas                                                       |
| ------------- | ------------- | ----------------------------------------------------------- |
| `id`          | serial PK     |                                                             |
| `url`         | text          | URL de solotodo.cl tal como la pegó el usuario (referencia) |
| `label`       | text          | nombre definido por el usuario                              |
| `category_id` | int, nullable | categoría de la API; null si no se pudo resolver            |
| `params`      | jsonb         | params combinados que se envían a `browse` (sin `ordering`) |
| `status`      | text          | `ok` \| `needs_review`                                      |
| `active`      | boolean       | pausada o no; se cambia desde el dashboard                  |
| `created_at`  | timestamp     |                                                             |

### `price_checks`

| campo            | tipo                                   | notas                                                                        |
| ---------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| `id`             | serial PK                              |                                                                              |
| `tracked_url_id` | FK → `tracked_urls`, on delete cascade |                                                                              |
| `checked_at`     | timestamp                              |                                                                              |
| `source`         | text                                   | `cron` \| `manual`                                                           |
| `product_id`     | int                                    | id del producto en SoloTodo                                                  |
| `product_name`   | text                                   |                                                                              |
| `product_slug`   | text                                   | para armar el link a la ficha                                                |
| `normal_price`   | integer                                | CLP; precio usado para comparar                                              |
| `offer_price`    | integer                                | CLP; informativo                                                             |
| `store_name`     | text, nullable                         | tienda con el menor `normal_price`; informativo                              |
| `store_url`      | text, nullable                         | `external_url` de esa oferta (página del producto en la tienda); informativo |

Como `product_id` queda registrado en cada chequeo, una consulta futura (`WHERE product_id = X ORDER BY checked_at`) entrega el histórico de un producto específico. No se necesita otra tabla para eso hoy.

## Resolución de URL (`lib/resolve-url.ts`)

Al agregar una URL:

1. Validar que el host sea `www.solotodo.cl` o `solotodo.cl`; si no, rechazar el alta con un error de validación.
2. Descargar el HTML de la página y extraer, del payload embebido de la landing, el `category` id y el string `params` implícito (ej. `format_families=1560421&base_buses=1559281`).
3. Combinar los params implícitos con los query params de la URL; si una clave aparece en ambos, gana el de la URL. Se descarta `ordering`, porque el chequeo siempre fuerza el suyo.
4. Hacer un llamado de prueba a `/categories/{category_id}/browse/` con esos params.
5. Resultado:
    - Categoría resuelta y ≥ 1 resultado → `status: "ok"`.
    - No se encontró la categoría en el HTML, la llamada falla o devuelve 0 resultados → se guarda igual con `status: "needs_review"`. Las URLs en ese estado no se chequean hasta que se corrijan `category_id`/`params` directo en la base de datos (no hay editor en el dashboard; es un caso ocasional).

La extracción desde el HTML depende de la estructura interna del sitio y puede romperse si SoloTodo la cambia; por eso existe `needs_review`, y no se asume que la resolución siempre funciona.

## Lógica de chequeo (`lib/check-prices.ts`)

`checkPrices({ source, trackedUrlId? })` procesa todas las `tracked_urls` con `active = true` y `status = "ok"`, o solo la indicada por `trackedUrlId`. Las URLs se procesan de forma secuencial.

Para cada una:

1. Llamar `/categories/{category_id}/browse/` con `params` + `ordering=normal_price_usd`.
2. Tomar, dentro de la primera página, la entrada con menor `normal_price` (protege contra que la API ignore el `ordering`).
3. Obtener la tienda (informativo): llamar `/products/{id}/entities/`, quedarse con las ofertas con `active_registry.is_available = true` y elegir la de menor `normal_price` (si hay empate, la primera). El nombre sale de `/stores/`, que se pide una sola vez por ejecución de `checkPrices`. Si cualquiera de estas llamadas falla o no hay oferta disponible, `store_name` y `store_url` quedan en null y el chequeo continúa.
4. Leer el último `price_check` de esa URL (de cualquier `source`).
5. Insertar el nuevo `price_check` con `source`. Se inserta siempre que la llamada haya sido exitosa, suba, baje o se mantenga el precio.
6. Si `source === "cron"` **y** existe un registro anterior **y** el nuevo `normal_price` es menor que el anterior → enviar email.

Reglas explícitas:

- La comparación es por precio, aunque el producto más barato haya cambiado entre chequeos (ej. entra un producto nuevo más barato → cuenta como baja).
- El primer chequeo de una URL (sin registro anterior) nunca envía email.
- Un refresh manual que detecta una baja inserta el registro y no envía email. Como el cron compara contra el último registro, **ese día el cron no enviará email por esa baja**. Es intencional: si el usuario hizo el refresh manual, ya vio el precio.

## Alertas por email (`lib/email.ts`)

- Solo con `source === "cron"` y baja de `normal_price` (ver arriba).
- Destinatario: variable de entorno `ALERT_EMAIL`.
- Contenido: `label` de la URL trackeada, nombre del producto, `normal_price` anterior → nuevo, `offer_price` actual, link a la ficha en SoloTodo y, si está disponible, el nombre de la tienda con link a su página del producto.
- Un email por baja, sin agrupación.
- Si Resend falla, se loguea el error y la alerta se pierde. No hay reintento: el `price_check` ya quedó registrado, así que el próximo chequeo compara contra el precio nuevo. Es aceptable para una herramienta personal donde el dashboard sigue mostrando el cambio.

## Dashboard (`app/page.tsx`)

Página única.

**Lista de URLs trackeadas**, cada fila muestra:

- `label` y nombre del producto más barato actual. El nombre es un link a la ficha del producto en SoloTodo.
- Tienda (secundario, informativo), como link a su página del producto. Se omite si el último registro no la tiene.
- `normal_price` actual (destacado) y `offer_price` (secundario, rotulado como precio con medio de pago específico).
- Variación de `normal_price` vs. el registro anterior (baja / sube / sin cambio).
- Fecha del último chequeo.
- Sparkline del histórico de `normal_price`.
- Acciones: "Refrescar ahora" (POST manual), pausar/reactivar (`active`) y eliminar (borra la URL y su historial).
- Indicador visible si `status === "needs_review"`; en ese caso no se muestra "Refrescar ahora".

**Agregar URL:** formulario con URL + `label`. Ejecuta la resolución descrita arriba y muestra si quedó `ok` o `needs_review`.

## Manejo de errores y casos borde

- **API de SoloTodo caída, error HTTP o respuesta con forma inesperada:** se salta esa URL, se loguea el error, no se inserta `price_check`; las demás URLs se procesan igual.
- **0 resultados en una URL que antes tenía:** igual que un error: no se inserta registro, se loguea, el dashboard muestra el último precio conocido.
- **El cron no corre un día** (ej. Mac apagado): sin reintento; la siguiente ejecución compara contra el último registro, sin importar cuántos días pasaron.
- **Cron y refresh manual casi simultáneos:** sin lock; en el peor caso quedan dos registros cercanos. Solo el de `source: "cron"` puede enviar email, y compara contra el registro anterior a él.
- **Falla de Resend:** ver Alertas por email.

## Seguridad y deploy

- Local: el dashboard y la API solo escuchan en localhost; no hace falta protección adicional. La base es el Postgres local de Homebrew.
- **Paso a Supabase:** crear el proyecto, aplicar las migraciones Drizzle contra él (conexión directa o session pooler, puerto 5432) y configurar en Vercel `DATABASE_URL` con la connection string del **transaction pooler** (puerto 6543), adecuada para funciones serverless. Los datos locales no se migran salvo que se quiera (`pg_dump`/`psql` si hace falta).
- **Antes de desplegar a Vercel** hay que activar Vercel Deployment Protection (o una protección equivalente) sobre el dashboard y `/api/tracked-urls`, porque la app no tiene auth propia. `/api/check-prices` en modo cron queda protegido por `CRON_SECRET`.
- El cron de Vercel en plan Hobby permite una ejecución diaria, que coincide con la frecuencia definida.

## Testing

- **Vitest**, unit tests de:
    - `checkPrices`: baja/sube/igual; primer chequeo sin email; `source: "manual"` nunca envía email; cambio de producto más barato cuenta como baja; selección del menor `normal_price` dentro de la página aunque venga desordenada; falla al obtener la tienda → registro insertado con tienda null y comparación/email sin cambios; selección de la oferta disponible más barata ignorando las no disponibles.
    - `resolve-url`: host inválido rechazado; extracción de categoría y params implícitos desde un fixture HTML real guardado en el repo; combinación de params con prioridad de la URL; descarte de `ordering`; casos que terminan en `needs_review`.
    - Cliente `solotodo.ts` con respuestas mockeadas: éxito, 0 resultados, error 5xx, forma inesperada.
- Sin E2E automatizado del dashboard (página única, personal, bajo riesgo).
- Verificación manual una vez antes de dejarlo corriendo: agregar la URL de SSDs de ejemplo → ejecutar `scripts/check-prices.ts` → alterar el último registro en la DB a un precio mayor → ejecutar de nuevo y confirmar que llega el email real de Resend.
