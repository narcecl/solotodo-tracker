# SoloTodo Price Tracker — Design

## Contexto y objetivo

SoloTodo (`solotodo.cl`) ya agrega productos, precios y stock de múltiples tiendas chilenas. Este proyecto agrega una capa personal de seguimiento sobre SoloTodo: el usuario registra URLs de SoloTodo que le interesan (páginas de listado filtrado, ej. una búsqueda de SSDs con specs específicas), y la herramienta:

- Revisa periódicamente (cron diario) el producto más barato que cumple esos filtros.
- Guarda un historial de precio en el tiempo.
- Envía un email cuando el precio baja respecto al chequeo anterior.
- Permite un refresh manual desde un dashboard, sin generar notificación.

Uso personal, un solo usuario, sin autenticación.

## Investigación previa

`solotodo.cl` es un frontend sobre una API JSON pública y sin autenticación en `api.solotodo.com` (confirmado con requests directos durante el brainstorming: `GET https://api.solotodo.com/products/browse/...` devuelve JSON). Esto permite llamar la API directamente en vez de scrapear HTML renderizado por JS (sin necesidad de un navegador headless).

Los query params visibles en una URL de `solotodo.cl` (ej. `base_buses=1559281&bus=1559594&formats=...`) no siempre corresponden 1:1 a los parámetros reales que espera el endpoint de la API. La forma confiable de obtenerlos es inspeccionar la pestaña Network del navegador una vez por categoría de búsqueda nueva, y guardar el resultado (`resolved_params`) como lo que efectivamente se llama en cada chequeo — no la URL del sitio tal cual.

## Alcance

Cada `tracked_url` representa una página de **listado filtrado** de SoloTodo (no un producto único). Lo que se trackea es **el producto más barato que cumple esos filtros en cada chequeo**, no todos los productos del listado.

El modelo de datos deja espacio para expandir a un histórico por producto específico más adelante (ver sección Modelo de datos), sin requerir un rediseño.

## Stack técnico

- **Next.js 16** (App Router, TypeScript) — sirve el dashboard y las rutas API desde el mismo código.
- **Postgres gestionado (Neon)** desde el día uno — mismo comportamiento local y en producción, sin el problema de SQLite en filesystems efímeros de serverless.
- **Drizzle ORM** para el acceso a datos.
- **Resend** para el envío de emails.

### Por qué Postgres gestionado desde el inicio

El usuario planea correr esto localmente al principio, con posibilidad de desplegarlo a Vercel más adelante. Usar Neon desde ya evita una migración de base de datos futura: el mismo `DATABASE_URL` funciona en ambos entornos.

## Arquitectura

```
solotodo-tracker/
├── app/
│   ├── page.tsx                       # Dashboard: lista de URLs trackeadas
│   ├── api/
│   │   ├── tracked-urls/route.ts      # CRUD de URLs a trackear
│   │   └── check-prices/route.ts      # Ejecuta el chequeo (cron o manual)
├── lib/
│   ├── db/                            # Schema Drizzle + conexión
│   ├── solotodo.ts                    # Cliente que llama a api.solotodo.com
│   └── email.ts                       # Envío de alertas vía Resend
├── vercel.json                        # Config de Vercel Cron (para el deploy futuro)
```

**Ejecución local:** `next dev` sirve dashboard y rutas API. Un cron local (`launchd` o `cron` de macOS) hace `curl -X POST http://localhost:3000/api/check-prices` con `source=cron` una vez al día.

**Ejecución futura en Vercel:** mismo código y mismo endpoint `/api/check-prices`; se agrega `vercel.json` con un cron declarativo. Variables de entorno (`DATABASE_URL`, `RESEND_API_KEY`, `ALERT_EMAIL`) se copian tal cual.

## Modelo de datos

### `tracked_urls`
| campo | tipo | notas |
|---|---|---|
| `id` | serial PK | |
| `url` | text | URL cruda de SoloTodo, guardada solo como referencia |
| `label` | text | nombre definido por el usuario |
| `resolved_params` | jsonb | parámetros reales usados para llamar la API de SoloTodo |
| `status` | text | `ok` \| `needs_review` |
| `active` | boolean | para pausar sin borrar |
| `created_at` | timestamp | |

### `price_checks`
| campo | tipo | notas |
|---|---|---|
| `id` | serial PK | |
| `tracked_url_id` | FK → `tracked_urls` | |
| `checked_at` | timestamp | |
| `product_id` | int | id del producto en SoloTodo (el más barato en ese chequeo) |
| `product_name` | text | |
| `price` | numeric | CLP |
| `store_name` | text | si la API lo expone en ese nivel |
| `product_url` | text | link directo al producto |

Como `product_id` queda registrado en cada check, una consulta futura (`WHERE product_id = X ORDER BY checked_at`) entrega el histórico de un producto específico, aunque haya dejado de ser el más barato en algún momento. No se requiere una tabla adicional para esto hoy.

### `alerts_sent`
| campo | tipo | notas |
|---|---|---|
| `id` | serial PK | |
| `tracked_url_id` | FK | |
| `price_check_id` | FK → `price_checks` | el check que disparó la alerta |
| `sent_at` | timestamp | |

## Lógica de chequeo (`/api/check-prices`)

Recibe `source: "cron" | "manual"` y, opcionalmente, `tracked_url_id` (para forzar el chequeo de una sola URL desde el botón de refresh del dashboard).

Para cada `tracked_url` activa a procesar:

1. Llamar `api.solotodo.com` con el `resolved_params` guardado; tomar el primer resultado (ya viene ordenado por precio).
2. Comparar el precio obtenido contra el último `price_check` guardado para esa `tracked_url`.
3. Insertar el nuevo `price_check` siempre que la llamada haya sido exitosa — independiente de si el precio subió, bajó o quedó igual, y sin importar el `source`.
4. Si `source === "cron"` **y** el precio bajó respecto al `price_check` anterior → enviar email de alerta (ver siguiente sección). Un chequeo con `source: "manual"` nunca dispara email, solo refresca lo que se ve en el dashboard.
5. Si la API falla, devuelve error, o devuelve 0 resultados → no se inserta `price_check`; se loguea el error y se continúa con la siguiente URL del batch (un fallo no bloquea el resto).

## Alertas por email

- Se envía solo cuando `source === "cron"` y el precio bajó.
- Contenido: nombre del producto, precio anterior → precio nuevo, link directo al producto, y el `label` de la URL trackeada.
- Destinatario configurado vía variable de entorno `ALERT_EMAIL` (no hardcodeado).
- Se registra en `alerts_sent` solo tras un envío exitoso de Resend. Si el envío falla, no se marca como enviado, así que si en el próximo chequeo cron el precio sigue bajo respecto al historial previo a la baja, se reintenta el envío de forma natural — sin necesidad de un mecanismo de reintento explícito.
- Sin agrupación ni digest: cada bajada de precio de cada URL genera un email individual.

## Dashboard (`app/page.tsx`)

Página única, sin autenticación.

**Lista de URLs trackeadas**, cada fila muestra:
- `label`
- Precio actual más barato, producto y tienda
- Variación vs. el chequeo anterior (baja / sube / sin cambio)
- Fecha del último chequeo
- Botón "Refrescar ahora" (llama `check-prices` con `source: manual`)
- Sparkline con el histórico de precio de esa URL
- Link directo al producto en SoloTodo
- Indicador visual si `status === "needs_review"`

**Agregar URL nueva:**
1. El usuario pega la URL de SoloTodo y define un `label`.
2. El backend intenta parsear los query params de la URL pegada y hace un llamado de prueba a la API.
3. Si devuelve resultados → se guarda con `status: "ok"`, activa desde ya.
4. Si falla o devuelve 0 resultados → se guarda con `status: "needs_review"`. La corrección de `resolved_params` en este caso se hace editando directo en la base de datos (no hay editor de JSON en el dashboard) — es un caso ocasional y el usuario es el único operador del sistema.

## Manejo de errores y casos borde

- **API de SoloTodo caída o cambia de forma:** se salta el chequeo de esa URL, se loguea el error, no se inserta un `price_check` corrupto; las demás URLs del batch se procesan igual.
- **0 resultados donde antes había:** se trata igual que un error — no se inserta check, se loguea, el dashboard sigue mostrando el último precio conocido.
- **Cron no corre un día** (ej. la máquina local apagada): sin retry automático; al correr de nuevo compara contra el último precio guardado, sin importar cuántos días pasaron.
- **Ejecuciones casi simultáneas** (cron + refresh manual): sin lock especial; en el peor caso se insertan dos `price_checks` muy cercanos con el mismo precio, sin generar doble email (la comparación siempre es contra el último registro existente).
- **Falla de envío de Resend:** cubierto arriba, en Alertas por email.

## Testing

- **Vitest** para unit tests de:
  - La función de comparación de precios (decide si dispara email), incluyendo que `source: manual` nunca notifica.
  - El parser de query params de SoloTodo → `resolved_params`, con casos válidos e inválidos.
  - El cliente de `api.solotodo.com`, mockeando respuestas (éxito, 0 resultados, error 5xx) contra los casos de la sección de manejo de errores.
- Sin E2E automatizado (Playwright, etc.) para el dashboard — página única, personal, de bajo riesgo; no justifica el mantenimiento de esa suite.
- Verificación manual del flujo completo (agregar URL → cron simulado → email real de Resend) una vez, antes de dejarlo corriendo diario.
