# SoloTodo Tracker

Seguimiento personal de precios sobre listados filtrados de [SoloTodo](https://www.solotodo.cl).
Cada día guarda todos los productos de cada listado (destacando el más barato) y envía un email si alguno cambió de precio normal.

Diseño: `docs/superpowers/specs/2026-09-28-solotodo-price-tracker-design.md`

## Setup

1. `npm install`
2. `cp .env.example .env.local` y completar:
    - `DATABASE_URL`: Postgres local, `postgresql://<usuario>@localhost:5432/solotodo_tracker` con `<usuario>` = `whoami` (requiere `brew services start postgresql@17` y `createdb solotodo_tracker`).
    - `RESEND_API_KEY`: API key de Resend.
    - `ALERT_EMAIL`: destinatario. Con el remitente por defecto (`onboarding@resend.dev`), Resend solo entrega al email de tu cuenta de Resend.
    - `CRON_SECRET`: `openssl rand -hex 32`.
3. `npm run db:migrate`
4. `npm run dev` y abrir http://localhost:3000

## Comandos

| Comando                              | Qué hace                                           |
| ------------------------------------ | -------------------------------------------------- |
| `npm run dev`                        | Dashboard en localhost:3000                        |
| `npm test`                           | Tests (Vitest)                                     |
| `npm run typecheck`                  | Tipos (incluye `next typegen`)                     |
| `npm run check-prices`               | Ejecuta el chequeo como cron (puede enviar emails) |
| `npm run db:generate` / `db:migrate` | Migraciones Drizzle                                |

## Cron local (macOS)

`./scripts/install-launchd.sh` instala un LaunchAgent que ejecuta `scripts/check-prices.ts` todos los días a las 09:00, sin necesidad de tener `next dev` corriendo. Si el Mac está dormido a esa hora, se ejecuta al despertar; si está apagado, ese día se salta.

- Ejecutar ahora: `launchctl kickstart -k gui/$(id -u)/cl.narce.solotodo-tracker`
- Log: `logs/check-prices.log`
- Desinstalar: `launchctl bootout gui/$(id -u)/cl.narce.solotodo-tracker && rm ~/Library/LaunchAgents/cl.narce.solotodo-tracker.plist`

## URLs en revisión

Si al agregar una URL no se puede resolver su categoría o el listado de prueba no trae resultados, queda con `status = 'needs_review'` y no se chequea. Para corregirla, editar `category_id` y `params` en la tabla `tracked_urls` (por ejemplo, con `psql -d solotodo_tracker` en local, o desde el SQL Editor de Supabase una vez desplegado) y dejar `status = 'ok'`. `params` es un JSON `{ "clave": ["valor", ...] }` con los mismos filtros de la URL del sitio.

## Deploy a Vercel (futuro)

1. Crear un proyecto en [Supabase](https://supabase.com) y aplicar las migraciones contra él usando la connection string directa o del session pooler (puerto 5432):
   `DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' npm run db:migrate`
   (`process.loadEnvFile` no pisa variables ya definidas, así que esta URL tiene prioridad sobre `.env.local`).
2. Importar el repo en Vercel y copiar las variables de entorno de `.env.local`, pero con `DATABASE_URL` = connection string del **transaction pooler** de Supabase (puerto 6543). El cliente ya usa `prepare: false`, que ese modo requiere.
3. (Opcional) Copiar los datos locales: `pg_dump --data-only solotodo_tracker | psql '<url de Supabase, puerto 5432>'`.
4. **Activar Deployment Protection** antes de exponer la app: el dashboard y sus Server Actions no tienen autenticación propia.
5. `vercel.json` ya declara el cron diario sobre `/api/check-prices`, que Vercel llama por GET con `Authorization: Bearer $CRON_SECRET`. Desinstalar el LaunchAgent local para no duplicar los chequeos.
