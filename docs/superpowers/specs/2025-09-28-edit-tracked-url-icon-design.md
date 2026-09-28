# Design: Editar URLs trackeadas + Iconos por categoría

## Objetivo

Permitir editar una URL trackeada existente (nombre, URL, categoryId, params) y mostrar un icono de Lucide en cada tarjeta del dashboard mapeado desde el `categoryId` de SoloTodo via un mapa hardcodeado.

---

## Scope

### In scope
- Nuevo endpoint `GET /api/tracked-urls/[id]` para cargar datos de edición.
- Extender `PATCH /api/tracked-urls/[id]` para aceptar `label`, `url`, `categoryId`, `params`.
- Nuevo componente `EditUrlForm` (dialog modal) para editar una URL existente.
- Nuevo mapa hardcodeado `src/lib/category-icons.ts`: `categoryId` → nombre de icono Lucide.
- Renderizar icono dinámico en `TrackedUrlRow` usando el `categoryId` del producto mapeado.
- Agregar acción "Editar" al dropdown de `RowActions`.

### Out of scope
- Creación de tabla/crud de categorías propias (no se almacena icono en base de datos).
- Re-scrape automático al editar URL (el usuario ajusta manualmente `categoryId`/`params` para corregir `needs_review`).
- Selector visual de iconos (solo mapa hardcodeado en código).

---

## Data Model

Sin cambios de schema SQL. Se usan los campos existentes en `tracked_urls`:
- `label`
- `url`
- `categoryId`
- `params`
- `status`

No se agrega columna de icono.

---

## API

### `GET /api/tracked-urls/[id]`

Devuelve un objeto `TrackedUrl` (el mismo tipo de `src/lib/types.ts`) para precargar el formulario de edición.

**Errores:**
- `404` si el ID no existe o no es número entero positivo.

### `PATCH /api/tracked-urls/[id]` (extendido)

Acepta ahora:
```json
{
  "label": "string",
  "url": "string",
  "categoryId": 123 | null,
  "params": { "key": ["value"] }
}
```

Validaciones:
- `label` no puede estar vacío.
- `url` debe ser URL válida de `solotodo.cl`, no de producto individual (`/products/`).
- `categoryId` puede ser `null` o número entero.
- `params` puede ser cualquier objeto JSON (se valida que sea objeto).

Al guardar, se actualizan los 4 campos directamente en la fila. NO se ejecuta scraping para deducir `categoryId`/`params` automáticamente; el usuario los ajusta manualmente si quiere corregir una URL en `needs_review`.

**Errores:**
- `400` si algún campo no pasa validación.
- `404` si el ID no existe.

### `POST /api/tracked-urls` (existente)

Sin cambios de comportamiento. Sigue extrayendo `categoryId`/`params` automáticamente del HTML de SoloTodo.

---

## Icono por categoría

Nuevo archivo: `src/lib/category-icons.ts`

```ts
const CATEGORY_ICONS: Record<number, string> = {
  // categoryId de SoloTodo → nombre exacto de componente de lucide-react
  3: 'Laptop',
  5: 'Cpu',
  8: 'HardDrive',
  // se amplía con cada nueva categoría detectada
};

export function getCategoryIcon(categoryId: number | null): string {
  return CATEGORY_ICONS[categoryId ?? 0] ?? 'Package';
}
```

La función retorna `'Package'` como fallback cuando no hay mapeo.

Uso en `TrackedUrlRow`: reemplazar el placeholder cuadrado vacío (`<div className="size-11 border rounded-md" />`) por el icono Lucide correspondiente, resuelto dinámicamente a partir del string retornado por `getCategoryIcon(tracked.categoryId)`. Se resuelve vía un componente `DynamicIcon` que mapea el string a la importación de `lucide-react`.

---

## Componentes UI

### `EditUrlForm` (`src/components/dashboard/edit-url-form.tsx`)

- Dialog con los mismos estilos que `AddUrlForm`.
- Campos:
  - **Nombre** (`label`): input text, required, maxLength 100.
  - **URL**: input url, required.
  - **Categoría SoloTodo** (`categoryId`): input type="number", nullable. Label ayuda: "ID de categoría en SoloTodo (útil para corregir URLs en revisión)".
  - **Parámetros** (`params`): textarea con JSON. Label ayuda: "Filtros de la URL en formato JSON".
- Botones: "Guardar cambios" y "Cancelar".
- Estados: `pending`, `message` (ok/warn/error), mismos patrones de `AddUrlForm`.
- Precargar datos haciendo `GET /api/tracked-urls/[id]` al abrirse.
- Al guardar con éxito: cerrar dialog y `router.refresh()`.

### `RowActions` (`src/components/dashboard/row-actions.tsx`)

- Agregar ítem "Editar" al dropdown.
- Al hacer click, abre `<EditUrlForm id={id} />`.

### `TrackedUrlRow` (`src/components/dashboard/tracked-url-row.tsx`)

- Reemplazar el `<div className="size-11 border rounded-md">` vacío por icono Lucide resuelto desde `getCategoryIcon(tracked.categoryId)`.
- Size: 20–24px, dentro del mismo contenedor 44×44.

---

## Repositorio / DB

Nueva función en `src/lib/db/repo.ts`:

```ts
export async function updateTrackedUrl(
  id: number,
  data: Partial<TrackedUrl>,
): Promise<TrackedUrl | null>;
```

O usa `set` directo con los campos permitidos. Existe ya `setTrackedUrlActive`, se agrega una genérica para el edit.

---

## Flujo de usuario

1. Usuario abre el dashboard y ve cada tarjeta con su icono de categoría.
2. Abre el menú ⋮ de una fila, selecciona **Editar**.
3. Se abre el modal precargado con los datos actuales.
4. Usuario cambia nombre, URL, o corrige categoryId/params.
5. Guarda. El backend actualiza la fila. El frontend refresca.
6. Si la URL estaba en `needs_review` y el usuario corrigió `categoryId`/`params`, puede luego sincronizar manualmente con el botón existente.

---

## Testing Notes

- Verificar que `GET /api/tracked-urls/[id]` devuelva 404 para IDs inválidos.
- Verificar que `PATCH` rechace URLs no-SoloTodo o de producto.
- Verificar que el icono renderizado sea correcto para `categoryId` mapeado y `Package` para los demás.
- Verificar que `EditUrlForm` precargue correctamente y cierre al guardar.

---

## Archivos a crear / modificar

| Archivo | Acción |
|---|---|
| `src/lib/category-icons.ts` | Crear |
| `src/lib/db/repo.ts` | Agregar `updateTrackedUrl` |
| `src/app/api/tracked-urls/[id]/route.ts` | Extender `PATCH`, agregar `GET` |
| `src/components/dashboard/edit-url-form.tsx` | Crear |
| `src/components/dashboard/row-actions.tsx` | Agregar ítem "Editar" |
| `src/components/dashboard/tracked-url-row.tsx` | Reemplazar cuadrado por icono |
