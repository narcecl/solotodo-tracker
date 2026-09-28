# Design: Editar URLs trackeadas + Iconos por categoría + Server Actions

## Objetivo

1. Permitir editar una URL trackeada existente (nombre, URL, categoryId, params). Editar debe servir para **sacar una URL de `needs_review`**: si los nuevos `categoryId`/`params` devuelven productos en SoloTodo, la URL vuelve a `status = 'ok'` y entra al cron y al botón "Sincronizar".
2. Mostrar un icono de Lucide en cada tarjeta del dashboard según el `categoryId` de SoloTodo, con un mapa hardcodeado.
3. Migrar **todas** las mutaciones del dashboard (crear, editar, pausar/reactivar, eliminar, sincronizar una, sincronizar todo) de API routes a Server Actions (`'use server'`), para no mantener rutas de API acotadas a la UI.

---

## Scope

### In scope

- Server Actions en `src/app/actions/` para todas las mutaciones del dashboard.
- Eliminar `src/app/api/tracked-urls/` completo (`route.ts` y `[id]/route.ts`).
- Eliminar el `POST` de `src/app/api/check-prices/route.ts`; **se mantiene el `GET`** porque lo llama el cron de Vercel (`vercel.json`) con `CRON_SECRET`.
- Nuevo componente `EditUrlForm` (dialog modal) precargado desde las props de la fila.
- Mapa hardcodeado `src/lib/category-icons.ts` y el icono en `TrackedUrlRow`.
- Ítem "Editar" en el dropdown de `RowActions`.
- Recalcular `status` al editar (validación vía `browse`).
- Adaptar los tests de API existentes a tests de las actions.

### Out of scope

- Tabla/CRUD de categorías propias (no se almacena icono en base de datos).
- Selector visual de iconos.
- Autenticación. Las actions quedan con el mismo nivel que tienen hoy las API routes (ninguno; se depende de Deployment Protection, ver README).

---

## Data Model

Sin cambios de schema SQL. Se usan los campos existentes en `tracked_urls`: `label`, `url`, `categoryId`, `params`, `status`, `active`. No se agrega columna de icono.

---

## Server Actions

### Convenciones

- Archivos con `'use server'` al tope, en `src/app/actions/`.
- **Las actions no lanzan errores para casos esperados**: retornan un resultado tipado. En producción Next oculta el mensaje de los errores lanzados, así que el mensaje para el usuario tiene que viajar en el valor de retorno.
- **Toda la validación se hace en el servidor.** Una Server Action es un endpoint POST público; sus argumentos (incluido `id`) llegan desde el cliente y no se confía en ellos.
- Tras una mutación exitosa se llama a `refresh()` de `next/cache` para refrescar el router cliente. Los componentes ya no llaman a `router.refresh()`.
- `parseId` (hoy local en `api/tracked-urls/[id]/route.ts`) se mueve a `src/lib/validation.ts` junto con los validadores nuevos (`parseParams`, `parseCategoryId`), para testearlos aislados.

Tipos compartidos (`src/app/actions/types.ts`, **sin** `'use server'`: un archivo `'use server'` solo puede exportar funciones async):

```ts
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type FormState =
    | { kind: 'idle' }
    | { kind: 'ok' | 'warn'; text: string }
    | { kind: 'error'; text: string; field?: 'label' | 'url' | 'categoryId' | 'params' };
```

### `src/app/actions/tracked-urls.ts`

| Action                                                       | Reemplaza                          | Uso en cliente                          |
| ------------------------------------------------------------ | ---------------------------------- | --------------------------------------- |
| `createTrackedUrlAction(prev: FormState, formData: FormData)` | `POST /api/tracked-urls`           | `useActionState` en `AddUrlForm`        |
| `updateTrackedUrlAction(prev: FormState, formData: FormData)` | nuevo                              | `useActionState` en `EditUrlForm`       |
| `setTrackedUrlActiveAction(id: number, active: boolean)`      | `PATCH /api/tracked-urls/[id]`     | `startTransition` en `RowActions`       |
| `deleteTrackedUrlAction(id: number)`                          | `DELETE /api/tracked-urls/[id]`    | `startTransition` en `RowActions`       |

`setTrackedUrlActiveAction` y `deleteTrackedUrlAction` retornan `ActionResult`. Validan `id` con `parseId` y `active` con `typeof === 'boolean'`; si la fila no existe → `{ ok: false, error: 'No encontrada' }`.

`createTrackedUrlAction` conserva la lógica actual del `POST`: label obligatorio, `resolveUrl`, `InvalidUrlError` → `{ kind: 'error', field: 'url' }`, y `ok` o `warn` según el `status` resuelto (mismos textos que hoy).

### `src/app/actions/check-prices.ts`

| Action                               | Reemplaza                                     | Uso en cliente                    |
| ------------------------------------ | --------------------------------------------- | --------------------------------- |
| `syncTrackedUrlAction(id: number)`   | `POST /api/check-prices` con `trackedUrlId`   | `startTransition` en `RowActions` |
| `syncAllAction()`                    | `POST /api/check-prices` sin body             | `SyncAllButton` + `toast.promise` |

Ambas retornan `ActionResult<CheckSummary>` (el mismo objeto que hoy devuelve `checkPrices`). Si `summary.checked === 0` → `{ ok: false, error: 'No se pudo actualizar ningún precio' }`. Usan `source: 'manual'`.

> **Nota:** el cliente despacha las Server Actions de a una (documentado en `07-mutating-data.md`). Mientras corre "Sincronizar todo", un "Pausar" o "Editar" queda en cola hasta que termine. Para este dashboard de un solo usuario es aceptable; los botones muestran pending mientras tanto.

### `updateTrackedUrlAction`: validaciones

Recibe en el `FormData`: `id`, `label`, `url`, `categoryId`, `params` (JSON string). Lee la fila actual con `priceRepo.getTrackedUrl(id)`; **no** se reciben los valores originales desde el cliente.

- `id`: `parseId`. Si la fila no existe → `{ kind: 'error', text: 'No encontrada' }`.
- `label`: no vacío tras `trim()`, máximo 100 caracteres.
- `url`: `parseSolotodoUrl` de `src/lib/resolve-url.ts` (host solotodo.cl, http/https, no `/products/`). Se guarda `url.toString()` normalizado. `InvalidUrlError` → error con su mensaje, `field: 'url'`.
- `categoryId`: vacío → `null`; si no, entero positivo.
- `params`: JSON parseable con forma `Record<string, string[]>`. Cualquier otra forma (`{"a": 1}`, `[]`, JSON inválido) → error `field: 'params'`. Vacío → `{}`.

### `updateTrackedUrlAction`: cálculo de status

Se compara contra la fila actual (`params` con comparación estructural, así reformatear el JSON no cuenta como cambio):

1. **Cambió `url` y `categoryId`/`params` siguen iguales a los actuales**: se re-resuelve con `resolveUrl(url, deps)`, igual que al crear, y se usan su `categoryId`, `params` y `status`. Así una URL nueva nunca queda con los filtros de la anterior.
2. **Cambió `categoryId` o `params`**: se usan los valores del formulario y se recalcula `status`:
    - `categoryId === null` → `'needs_review'`.
    - Si no, `client.browse(categoryId, params)`: con resultados → `'ok'`; sin resultados o si falla → `'needs_review'`.
3. **Solo cambió `label`**: no se llama a SoloTodo y se mantiene el `status` actual.

Luego: `updateTrackedUrl(id, { label, url, categoryId, params, status })`, `refresh()` y retorno:

- `status === 'ok'` → `{ kind: 'ok', text: 'Cambios guardados.' }`
- `status === 'needs_review'` → `{ kind: 'warn', text: 'Cambios guardados, pero la URL sigue sin resolver: revisa categoría y parámetros.' }`

La decisión (1/2/3 → status) se extrae a una función pura `resolveEdit(current, input, deps)` en `src/lib/resolve-edit.ts`, con `resolveUrl`/`browse` inyectados como en `ResolveDeps`, para testearla sin DB ni red.

---

## Icono por categoría

Nuevo archivo: `src/lib/category-icons.ts`. Es un objeto plano `categoryId → componente`:

```ts
import {
    CircuitBoard, Cpu, Gamepad2, Gpu, HardDrive, Headphones, Laptop,
    MemoryStick, Monitor, Package, Smartphone, Tablet, Tv, type LucideIcon,
} from 'lucide-react';

// categoryId de SoloTodo → icono. Agregar una línea por categoría nueva.
// IDs desde https://api.solotodo.com/categories/
const iconConfig: Record<number, LucideIcon> = {
    1: Laptop, // Notebooks
    2: Gpu, // Tarjetas de video
    3: Cpu, // Procesadores
    4: Monitor, // Monitores
    5: CircuitBoard, // Placas madre
    6: Smartphone, // Celulares
    7: MemoryStick, // Ram
    8: HardDrive, // Discos duros
    11: Tv, // Televisores
    14: Tablet, // Tablets
    33: Gamepad2, // Consolas
    39: HardDrive, // Unidades de Estado Sólido
    50: Headphones, // Audífonos y Headsets
};

export function getCategoryIcon(categoryId: number | null): LucideIcon {
    return (categoryId !== null && iconConfig[categoryId]) || Package;
}
```

- Se tipa con clave `number` porque `categoryId` es `number` en `TrackedUrl`: se indexa directo, sin `String(categoryId)`. En runtime es idéntico a usar claves `'12'` (JS convierte las claves de objeto a string).
- Imports estáticos: tree-shakeable y tipados. No se usa `DynamicIcon` ni resolución por nombre.
- Fallback: `Package`.
- IDs verificados contra `https://api.solotodo.com/categories/` (endpoint público, 70 categorías). Cubre las categorías en uso hoy en `tracked_urls` (3, 14, 39) más las de hardware y electrónica más comunes. Todos los iconos existen en la versión instalada de `lucide-react`.

Uso en `TrackedUrlRow`:

```tsx
const Icon = getCategoryIcon(tracked.categoryId);
// ...
<div className="flex size-11 items-center justify-center rounded-md border">
    <Icon className="size-5 text-muted-foreground" />
</div>
```

---

## Componentes UI

### Formularios con `useActionState`: evitar el reset automático

React resetea los formularios no controlados cuando termina una action pasada por `<form action={...}>`, **también cuando termina con error**. El usuario perdería lo que escribió, y en `EditUrlForm` volvería a los valores originales.

Por eso `AddUrlForm` y `EditUrlForm` **no** usan `<form action>`. Usan `onSubmit` con `event.preventDefault()`, arman el `FormData` y llaman `startTransition(() => formAction(formData))`, el patrón de `useActionState` + `startTransition` que muestra la documentación. `AddUrlForm` hace `form.reset()` manualmente solo cuando el resultado es `ok` o `warn`.

### Mensajes compartidos (`src/components/dashboard/form-message.tsx`)

Extraer de `AddUrlForm` `MESSAGE_CLASS` y un componente `<FormMessage state={state} />` que renderiza `FormState`. Lo usan `AddUrlForm` y `EditUrlForm`.

### `AddUrlForm`

- `useActionState(createTrackedUrlAction, { kind: 'idle' })` con el patrón de arriba.
- Quita el `fetch` y el `router.refresh()`.
- Usa `FormMessage`.
- Texto: "Usa \"Refrescar ahora\"" → "Usa \"Sincronizar\"".

### `EditUrlForm` (`src/components/dashboard/edit-url-form.tsx`)

- Client component. Props: `tracked: TrackedUrl`, `open: boolean`, `onOpenChange(open: boolean)`. Controlado desde `RowActions`.
- Valores iniciales desde `tracked` (sin fetch), como `defaultValue`.
- Dialog con los mismos estilos que `AddUrlForm`.
- Campos:
    - **Nombre** (`label`): input text, required, maxLength 100.
    - **URL** (`url`): input url, required.
    - **Categoría SoloTodo** (`categoryId`): input number, min 1, opcional. Ayuda: "ID de categoría en SoloTodo (útil para corregir URLs en revisión)".
    - **Parámetros** (`params`): textarea con `JSON.stringify(tracked.params, null, 2)`. Ayuda: "Filtros de la URL en formato JSON".
    - Hidden: `id`.
    - Ayuda general: "Si cambias la URL sin tocar categoría ni parámetros, se vuelven a detectar automáticamente."
- Botones: "Guardar cambios" (disabled mientras `pending`) y "Cancelar".
- `kind: 'ok'` → cerrar el dialog y mostrar `toast.success`.
- `kind: 'warn'` → el dialog queda abierto con el mensaje.
- `kind: 'error'` → mostrar el mensaje; si trae `field`, marcar ese input con `aria-invalid`.
- El contenido del form se monta con `key={tracked.id + ':' + openCount}` (o se desmonta al cerrar) para que al reabrir tome los valores actuales y descarte el estado anterior.

### `RowActions` (`src/components/dashboard/row-actions.tsx`)

- Recibe `tracked: TrackedUrl` en vez de `id`/`active` sueltos. `canRefresh` se sigue pasando o se deriva de `tracked.status`.
- `run()` pasa a recibir `() => Promise<ActionResult<unknown>>` en vez de `() => Promise<Response>`, y muestra `result.error` si `!result.ok`. Se mantiene `useTransition` para el pending.
- Sincronizar → `syncTrackedUrlAction(tracked.id)`; Pausar/Reactivar → `setTrackedUrlActiveAction(tracked.id, !tracked.active)`; Eliminar → `deleteTrackedUrlAction(tracked.id)` (conserva el `confirm`).
- Nuevo ítem "Editar". El estado `editOpen` vive en `RowActions` y `<EditUrlForm>` se renderiza **fuera** de `<DropdownMenuContent>`. El ítem usa `onSelect={() => setEditOpen(true)}`. Así se evita el bug de Radix donde el foco y `pointer-events: none` quedan pegados en el body al abrir un Dialog desde un DropdownMenu.
- El wrapper raíz hace `onClick={(e) => e.stopPropagation()}`. Los eventos de React burbujean a través de los portals, y sin esto cualquier click en el dropdown o el dialog activa el `onClick` del `CardHeader` y abre o cierra el accordion.

### `SyncAllButton`

- Llama a `syncAllAction()`. Para `toast.promise`, el resultado se convierte en promesa rechazada si `!ok`:
  ```ts
  const promise = syncAllAction().then((r) => (r.ok ? r.data : Promise.reject(new Error(r.error))));
  ```
- Quita el `router.refresh()` (lo hace la action).

### `TrackedUrlRow` (`src/components/dashboard/tracked-url-row.tsx`)

- Icono por categoría (ver arriba).
- Pasa `tracked` a `RowActions`.
- Tooltip del badge "Revisión pendiente": "Corrige category_id y params en la base de datos." → "No se pudo resolver la URL. Usa Editar para corregir categoría y parámetros."

---

## Repositorio / DB

Nueva función en `src/lib/db/repo.ts`:

```ts
export type TrackedUrlUpdate = Partial<Pick<TrackedUrl, 'label' | 'url' | 'categoryId' | 'params' | 'status'>>;

export async function updateTrackedUrl(id: number, data: TrackedUrlUpdate): Promise<TrackedUrl | null> {
    const [row] = await getDb().update(trackedUrls).set(data).where(eq(trackedUrls.id, id)).returning();
    return row ?? null;
}
```

El tipo restringido impide tocar `id`, `createdAt` o `active` desde la edición (`active` sigue por `setTrackedUrlActive`). Para leer la fila actual se reusa `priceRepo.getTrackedUrl(id)`.

---

## Flujo de usuario

1. El usuario ve en el dashboard cada tarjeta con su icono de categoría.
2. Abre el menú ⋮ de una fila y selecciona **Editar**.
3. Se abre el modal precargado con los datos actuales.
4. Cambia nombre, URL o corrige categoryId/params.
5. Guarda. La action valida, recalcula `status`, persiste y llama a `refresh()`.
6. Si quedó `ok`: el modal se cierra, aparece un toast, se va el badge "Revisión pendiente" y se habilita "Sincronizar". Si sigue en `needs_review`: el modal queda abierto con un aviso.

Pausar, eliminar y sincronizar se ven igual que hoy; solo cambia el transporte.

---

## Testing

Las actions se testean llamándolas directo como funciones async, con `vi.mock('next/cache', () => ({ refresh: vi.fn() }))` y los mismos mocks de `@/lib/db/repo` y `@/lib/resolve-url` que usan hoy los tests de API.

- **`tests/api-tracked-urls.test.ts` → `tests/actions-tracked-urls.test.ts`**, con los casos actuales portados:
    - create: label vacío, `InvalidUrlError` con su mensaje, guarda la URL resuelta con el label recortado, `ok` vs `warn`.
    - setActive: `active` no boolean, id inválido o inexistente, actualiza.
    - delete: borra; `No encontrada` si no existe.
    - Verifica que se llama a `refresh()` solo en los casos exitosos.
- **update** (en el mismo archivo):
    - Rechaza label vacío, URL no-SoloTodo, URL de `/products/`, `categoryId` no entero o ≤ 0, y `params` con forma incorrecta.
    - `id` inexistente → "No encontrada".
- **`tests/resolve-edit.test.ts`** (función pura):
    - `categoryId`/`params` editados con `browse` con resultados → `ok`; sin resultados → `needs_review`; `browse` que lanza → `needs_review`; `categoryId` null → `needs_review`.
    - Solo cambia `label` → no se llama a `browse` ni a `resolveUrl`, y el `status` no cambia.
    - Cambia `url` sin tocar `categoryId`/`params` → se usa `resolveUrl`.
    - Reformatear el JSON de `params` sin cambiar el contenido no cuenta como cambio.
- **`tests/api-check-prices.test.ts`**: se quita el bloque `POST` y se mantiene el bloque `GET (cron)`.
- **`tests/actions-check-prices.test.ts`**: sync de una URL con `source: 'manual'` y ese id; `checked === 0` → error; sync all sin id.
- **`tests/category-icons.test.ts`**: `getCategoryIcon` retorna el componente mapeado para IDs conocidos y `Package` para `null` o IDs desconocidos.
- **Manual:**
    - El modal precarga bien y conserva lo escrito si hay error.
    - Clickear dentro del modal o el dropdown no abre ni cierra el accordion.
    - El foco vuelve bien tras cerrar.
    - Pausar, eliminar y sincronizar siguen funcionando.

---

## Archivos a crear / modificar / eliminar

| Archivo                                        | Acción                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `src/app/actions/types.ts`                     | Crear (`ActionResult`, `FormState`)                                   |
| `src/app/actions/tracked-urls.ts`              | Crear (create, update, setActive, delete)                             |
| `src/app/actions/check-prices.ts`              | Crear (syncTrackedUrl, syncAll)                                       |
| `src/lib/validation.ts`                        | Crear (`parseId`, `parseCategoryId`, `parseParams`)                   |
| `src/lib/resolve-edit.ts`                      | Crear (decisión de status al editar)                                  |
| `src/lib/category-icons.ts`                    | Crear                                                                 |
| `src/lib/db/repo.ts`                           | Agregar `updateTrackedUrl` + `TrackedUrlUpdate`                       |
| `src/components/dashboard/form-message.tsx`    | Crear (extraído de `AddUrlForm`)                                      |
| `src/components/dashboard/edit-url-form.tsx`   | Crear                                                                 |
| `src/components/dashboard/add-url-form.tsx`    | Usar action + `FormMessage`, texto "Sincronizar"                      |
| `src/components/dashboard/row-actions.tsx`     | Actions, ítem "Editar", dialog controlado, `stopPropagation`          |
| `src/components/dashboard/sync-all-button.tsx` | Usar `syncAllAction`                                                  |
| `src/components/dashboard/tracked-url-row.tsx` | Icono, pasar `tracked`, texto del tooltip                             |
| `src/app/api/tracked-urls/route.ts`            | **Eliminar**                                                          |
| `src/app/api/tracked-urls/[id]/route.ts`       | **Eliminar**                                                          |
| `src/app/api/check-prices/route.ts`            | Quitar `POST`, mantener `GET` (cron)                                  |
| `tests/api-tracked-urls.test.ts`               | Reemplazar por `tests/actions-tracked-urls.test.ts`                   |
| `tests/api-check-prices.test.ts`               | Quitar bloque `POST`                                                  |
| `tests/actions-check-prices.test.ts`           | Crear                                                                 |
| `tests/resolve-edit.test.ts`                   | Crear                                                                 |
| `tests/category-icons.test.ts`                 | Crear                                                                 |
| `README.md`                                    | Línea 48: "el dashboard y sus Server Actions no tienen autenticación propia" |
