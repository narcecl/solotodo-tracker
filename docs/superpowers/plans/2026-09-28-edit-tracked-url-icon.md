# Edit Tracked URL + Category Icons + Server Actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user edit a tracked URL (and pull it out of `needs_review`), show a Lucide icon per SoloTodo category on each dashboard card, and move every dashboard mutation from API routes to Server Actions.

**Architecture:** Input parsing lives in a pure `src/lib/validation.ts`; the "what changed → new status" decision lives in a pure `src/lib/resolve-edit.ts` with injected SoloTodo deps. Thin `'use server'` files in `src/app/actions/` wire parsing + repo + `refresh()` from `next/cache`, returning typed results instead of throwing. Client components call the actions directly inside `startTransition`, so they fully control form reset, toasts and dialog closing. The `/api/tracked-urls` routes and the `POST /api/check-prices` handler are deleted; `GET /api/check-prices` stays for the Vercel cron.

**Tech Stack:** Next.js 16.3.6 (App Router, Server Actions), React 19.2, TypeScript, Tailwind v4, shadcn/ui (Radix), lucide-react, sonner, Drizzle ORM, Vitest (node environment, `tests/**/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-09-28-edit-tracked-url-icon-design.md`

## Global Constraints

- Next.js is 16.3.6 and differs from training data: read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (AGENTS.md). Server Actions: `01-app/01-getting-started/07-mutating-data.md` and `01-app/02-guides/server-actions.md`.
- After a successful mutation, actions call `refresh()` from `next/cache`. Client components never call `router.refresh()` again.
- A `'use server'` file may only export async functions. Shared types go in `src/app/actions/types.ts` (no directive).
- Actions never throw for expected failures; they return `ActionResult` / `FormState`. Unexpected errors may propagate.
- Every action argument is untrusted: validate `id`, `active` and every `FormData` field on the server.
- UI copy, error messages and code comments in Spanish; identifiers in English (match existing code).
- Code style: 4-space indent, single quotes, one JSX prop per line when there is more than one (Prettier config in repo; run `npm run format` on touched files if unsure).
- No test database: tests mock `@/lib/db/repo`, `@/lib/resolve-url`, `@/lib/check-prices`, `@/lib/deps` and `next/cache`.
- Never run `npm run db:migrate` or `npm run check-prices` without asking the user: they touch the real Supabase database and can send real emails.
- `label` max length: 100.
- `GET /api/check-prices` (cron with `Authorization: Bearer $CRON_SECRET`) must keep working unchanged.
- Deviation from spec, intentional: the spec mentions `useActionState`. Because the forms must (a) not auto-reset on error and (b) close the dialog / reset the form / toast as a reaction to the result, the client calls the action directly inside `startTransition` and stores the result with `useState`. Actions therefore take `(formData: FormData)` only, with no `prev` argument. Same UX, no effects needed.

## Review Focus

- Reformatting the params JSON (whitespace, key order) without changing content must not count as a filter change, so it must not trigger `browse`/`resolveUrl` or change `status`. Pinned in Task 3.
- Submitting the stored URL with surrounding spaces, or in a form that normalizes to the same string, must not count as a URL change (no re-resolve). Pinned in Task 4 (the action passes the `parseSolotodoUrl`-normalized URL to `resolveEdit`).
- A row deleted in another tab while its edit dialog is open: save must answer "No encontrada", not crash. Pinned in Task 4.
- A server-side validation error must keep everything the user typed in the edit/add dialog. This is why the forms don't use `<form action>`. Manual check in Task 7.
- Clicking anywhere inside the edit dialog or the ⋮ dropdown must not expand/collapse the card accordion. Manual check in Task 7.

---

## File Structure

| File                                           | Responsibility                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `src/lib/validation.ts`                        | Pure parsers: `parseId`, `parseLabel`, `parseCategoryId`, `parseParams`, `ValidationError` |
| `src/lib/category-icons.ts`                    | `categoryId` → `LucideIcon` map + `getCategoryIcon`                   |
| `src/lib/resolve-edit.ts`                      | Pure `resolveEdit` + `sameParams`: decides url/categoryId/params/status on edit |
| `src/lib/db/repo.ts`                           | + `updateTrackedUrl`, `TrackedUrlUpdate`                              |
| `src/app/actions/types.ts`                     | `ActionResult<T>`, `FormState`                                        |
| `src/app/actions/tracked-urls.ts`              | create / update / setActive / delete actions                          |
| `src/app/actions/check-prices.ts`              | syncTrackedUrl / syncAll actions                                      |
| `src/components/ui/textarea.tsx`               | shadcn textarea (generated)                                           |
| `src/components/dashboard/form-message.tsx`    | `FormMessage`, `IDLE_STATE`, `CONNECTION_ERROR`                       |
| `src/components/dashboard/add-url-form.tsx`    | Uses `createTrackedUrlAction`                                         |
| `src/components/dashboard/sync-all-button.tsx` | Uses `syncAllAction`                                                  |
| `src/components/dashboard/edit-url-form.tsx`   | New edit dialog                                                       |
| `src/components/dashboard/row-actions.tsx`     | Uses actions, "Editar" item, controlled dialog, `stopPropagation`     |
| `src/components/dashboard/tracked-url-row.tsx` | Category icon, passes `tracked`, tooltip copy                         |
| `src/app/api/tracked-urls/**`                  | Deleted                                                               |
| `src/app/api/check-prices/route.ts`            | `POST` removed                                                        |

---

### Task 0: Clean working tree (ask the user first)

The branch has uncommitted work (shadcn refactor, `sync-all-button.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `sonner.tsx`, `scripts/test-email.ts`, …) in several files this plan modifies. Mixing it into this plan's commits would make them unreviewable.

- [ ] **Step 1: Ask the user** how to handle the current changes (`git status --short`): commit them as their own commit (suggested message: `feat: shadcn dialog/dropdown/sonner + sync all button`), or have the user commit them. Do not stash or discard without explicit approval.
- [ ] **Step 2: Verify baseline**

Run: `npm test && npm run typecheck`
Expected: all tests pass, no type errors. If not, stop and report before starting Task 1.

---

### Task 1: Validation helpers

**Files:**
- Create: `src/lib/validation.ts`
- Test: `tests/validation.test.ts`

**Interfaces:**
- Produces:
  - `type FormField = 'label' | 'url' | 'categoryId' | 'params'`
  - `class ValidationError extends Error { readonly field: FormField }`, constructed as `new ValidationError(field, message)`
  - `LABEL_MAX = 100`
  - `parseId(raw: unknown): number | null`
  - `parseLabel(raw: unknown): string` (throws `ValidationError`)
  - `parseCategoryId(raw: unknown): number | null` (throws `ValidationError`)
  - `parseParams(raw: unknown): Params` (throws `ValidationError`)

- [ ] **Step 1: Write the failing test**

`tests/validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ValidationError, parseCategoryId, parseId, parseLabel, parseParams } from '@/lib/validation';

function fieldOf(fn: () => unknown): string | undefined {
    try {
        fn();
    } catch (error) {
        if (error instanceof ValidationError) return error.field;
        throw error;
    }
    return undefined;
}

describe('parseId', () => {
    it.each([
        [1, 1],
        ['7', 7],
        [' 3 ', 3],
    ])('acepta %j', (raw, expected) => {
        expect(parseId(raw)).toBe(expected);
    });

    it.each([0, -1, 1.5, 'abc', '', null, undefined, {}, true])('rechaza %j', (raw) => {
        expect(parseId(raw)).toBeNull();
    });
});

describe('parseLabel', () => {
    it('recorta espacios', () => {
        expect(parseLabel('  SSD 2TB ')).toBe('SSD 2TB');
    });

    it.each(['', '   ', null, 42])('rechaza %j como obligatorio', (raw) => {
        expect(() => parseLabel(raw)).toThrow('El nombre es obligatorio');
        expect(fieldOf(() => parseLabel(raw))).toBe('label');
    });

    it('rechaza más de 100 caracteres', () => {
        expect(parseLabel('a'.repeat(100))).toHaveLength(100);
        expect(fieldOf(() => parseLabel('a'.repeat(101)))).toBe('label');
    });
});

describe('parseCategoryId', () => {
    it.each(['', '  ', null])('vacío %j es null', (raw) => {
        expect(parseCategoryId(raw)).toBeNull();
    });

    it('acepta enteros positivos', () => {
        expect(parseCategoryId(' 39 ')).toBe(39);
    });

    it.each(['0', '-3', '1.5', 'abc'])('rechaza %j', (raw) => {
        expect(fieldOf(() => parseCategoryId(raw))).toBe('categoryId');
    });
});

describe('parseParams', () => {
    it.each(['', '   ', null])('vacío %j es {}', (raw) => {
        expect(parseParams(raw)).toEqual({});
    });

    it('acepta Record<string, string[]>', () => {
        expect(parseParams('{ "bus": ["1", "2"], "x": [] }')).toEqual({ bus: ['1', '2'], x: [] });
    });

    it.each(['no json', '[]', '"texto"', '42', 'null', '{"a": 1}', '{"a": "1"}', '{"a": [1]}', '{"a": ["1", null]}'])('rechaza %s', (raw) => {
        expect(fieldOf(() => parseParams(raw))).toBe('params');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/validation.test.ts`
Expected: FAIL, cannot resolve `@/lib/validation`.

- [ ] **Step 3: Write the implementation**

`src/lib/validation.ts`:

```ts
import type { Params } from './types';

export type FormField = 'label' | 'url' | 'categoryId' | 'params';

export class ValidationError extends Error {
    constructor(
        readonly field: FormField,
        message: string,
    ) {
        super(message);
    }
}

export const LABEL_MAX = 100;

const PARAMS_ERROR = 'Los parámetros deben ser un objeto JSON con listas de texto, por ejemplo {"marca": ["1"]}';

const text = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

export function parseId(raw: unknown): number | null {
    if (typeof raw !== 'number' && typeof raw !== 'string') return null;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
}

export function parseLabel(raw: unknown): string {
    const label = text(raw);
    if (!label) throw new ValidationError('label', 'El nombre es obligatorio');
    if (label.length > LABEL_MAX) throw new ValidationError('label', `El nombre no puede superar ${LABEL_MAX} caracteres`);
    return label;
}

export function parseCategoryId(raw: unknown): number | null {
    const value = text(raw);
    if (value === '') return null;
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('categoryId', 'La categoría debe ser un número entero positivo');
    return id;
}

export function parseParams(raw: unknown): Params {
    const value = text(raw);
    if (value === '') return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new ValidationError('params', PARAMS_ERROR);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new ValidationError('params', PARAMS_ERROR);
    for (const values of Object.values(parsed)) {
        if (!Array.isArray(values) || !values.every((v) => typeof v === 'string')) throw new ValidationError('params', PARAMS_ERROR);
    }
    return parsed as Params;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts tests/validation.test.ts
git commit -m "feat: add input validation helpers for tracked URLs"
```

---

### Task 2: Category icons on dashboard cards

**Files:**
- Create: `src/lib/category-icons.ts`
- Modify: `src/components/dashboard/tracked-url-row.tsx` (the empty `<div className="size-11 border rounded-md"></div>`)
- Test: `tests/category-icons.test.ts`

**Interfaces:**
- Produces: `getCategoryIcon(categoryId: number | null): LucideIcon`

- [ ] **Step 1: Write the failing test**

`tests/category-icons.test.ts`:

```ts
import { Cpu, HardDrive, Package, Tablet } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { getCategoryIcon } from '@/lib/category-icons';

describe('getCategoryIcon', () => {
    it('retorna el icono de las categorías en uso', () => {
        expect(getCategoryIcon(3)).toBe(Cpu);
        expect(getCategoryIcon(14)).toBe(Tablet);
        expect(getCategoryIcon(39)).toBe(HardDrive);
    });

    it('usa Package para null o categorías sin icono', () => {
        expect(getCategoryIcon(null)).toBe(Package);
        expect(getCategoryIcon(52)).toBe(Package);
        expect(getCategoryIcon(0)).toBe(Package);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/category-icons.test.ts`
Expected: FAIL, cannot resolve `@/lib/category-icons`.

- [ ] **Step 3: Write the implementation**

`src/lib/category-icons.ts`:

```ts
import {
    CircuitBoard,
    Cpu,
    Gamepad2,
    Gpu,
    HardDrive,
    Headphones,
    Laptop,
    MemoryStick,
    Monitor,
    Package,
    Smartphone,
    Tablet,
    Tv,
    type LucideIcon,
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/category-icons.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the icon in `TrackedUrlRow`**

In `src/components/dashboard/tracked-url-row.tsx`, add the import next to the other `@/lib` imports:

```ts
import { getCategoryIcon } from '@/lib/category-icons';
```

After `const others = products.filter((p) => p.position > 0);` add:

```ts
    const Icon = getCategoryIcon(tracked.categoryId);
```

Replace:

```tsx
                        <div className="size-11 border rounded-md"></div>
```

with:

```tsx
                        <div className="flex size-11 items-center justify-center rounded-md border">
                            <Icon className="size-5 text-muted-foreground" />
                        </div>
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/category-icons.ts tests/category-icons.test.ts src/components/dashboard/tracked-url-row.tsx
git commit -m "feat: show a category icon on each tracked URL card"
```

---

### Task 3: Edit resolution logic + repo update

**Files:**
- Create: `src/lib/resolve-edit.ts`
- Modify: `src/lib/db/repo.ts` (add after `setTrackedUrlActive`, ~line 98)
- Test: `tests/resolve-edit.test.ts`

**Interfaces:**
- Consumes: `ResolvedUrl` from `src/lib/resolve-url.ts`; `BrowseEntry`, `Params`, `TrackedUrl` from `src/lib/types.ts`.
- Produces:
  - `interface EditInput { label: string; url: string; categoryId: number | null; params: Params }`. `url` must already be normalized with `parseSolotodoUrl(...).toString()`.
  - `interface EditDeps { resolveUrl(url: string): Promise<ResolvedUrl>; browse(categoryId: number, params: Params): Promise<BrowseEntry[]> }`
  - `type EditResult = Pick<TrackedUrl, 'label' | 'url' | 'categoryId' | 'params' | 'status'>`
  - `resolveEdit(current: TrackedUrl, input: EditInput, deps: EditDeps): Promise<EditResult>`
  - `sameParams(a: Params, b: Params): boolean`
  - repo: `type TrackedUrlUpdate = Partial<Pick<TrackedUrl, 'label' | 'url' | 'categoryId' | 'params' | 'status'>>` and `updateTrackedUrl(id: number, data: TrackedUrlUpdate): Promise<TrackedUrl | null>`

- [ ] **Step 1: Write the failing test**

`tests/resolve-edit.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type EditDeps, type EditInput, resolveEdit, sameParams } from '@/lib/resolve-edit';
import type { BrowseEntry, TrackedUrl } from '@/lib/types';

const CURRENT: TrackedUrl = {
    id: 1,
    url: 'https://www.solotodo.cl/ssd-m2-pcie-nvme',
    label: 'SSD 2TB',
    categoryId: 39,
    params: { bus: ['1'], size: ['2000', '4000'] },
    status: 'needs_review',
    active: true,
    createdAt: new Date('2026-09-28T00:00:00Z'),
};

const ENTRY: BrowseEntry = { productId: 1, name: 'X', slug: 'x', normalPrice: 1, offerPrice: 1 };

const input = (overrides: Partial<EditInput> = {}): EditInput => ({
    label: CURRENT.label,
    url: CURRENT.url,
    categoryId: CURRENT.categoryId,
    params: CURRENT.params,
    ...overrides,
});

let deps: { resolveUrl: ReturnType<typeof vi.fn>; browse: ReturnType<typeof vi.fn> };

beforeEach(() => {
    deps = { resolveUrl: vi.fn(), browse: vi.fn() };
});

const run = (i: EditInput) => resolveEdit(CURRENT, i, deps as unknown as EditDeps);

describe('sameParams', () => {
    it('ignora el orden de las claves', () => {
        expect(sameParams({ a: ['1'], b: ['2'] }, { b: ['2'], a: ['1'] })).toBe(true);
    });

    it('detecta valores, claves o largo distintos', () => {
        expect(sameParams({ a: ['1'] }, { a: ['2'] })).toBe(false);
        expect(sameParams({ a: ['1'] }, { b: ['1'] })).toBe(false);
        expect(sameParams({ a: ['1'] }, { a: ['1', '2'] })).toBe(false);
        expect(sameParams({ a: ['1'] }, {})).toBe(false);
    });
});

describe('resolveEdit', () => {
    it('solo cambia label: no consulta SoloTodo y mantiene el status', async () => {
        const result = await run(input({ label: 'Nuevo' }));
        expect(result).toEqual({ label: 'Nuevo', url: CURRENT.url, categoryId: 39, params: CURRENT.params, status: 'needs_review' });
        expect(deps.browse).not.toHaveBeenCalled();
        expect(deps.resolveUrl).not.toHaveBeenCalled();
    });

    it('params con otro orden de claves no cuenta como cambio', async () => {
        await run(input({ params: { size: ['2000', '4000'], bus: ['1'] } }));
        expect(deps.browse).not.toHaveBeenCalled();
        expect(deps.resolveUrl).not.toHaveBeenCalled();
    });

    it('cambia url sin tocar filtros: re-resuelve con resolveUrl', async () => {
        const url = 'https://www.solotodo.cl/notebooks';
        deps.resolveUrl.mockResolvedValue({ url, categoryId: 1, params: { ram: ['16'] }, status: 'ok' });
        const result = await run(input({ url, label: 'Notebooks' }));
        expect(deps.resolveUrl).toHaveBeenCalledWith(url);
        expect(deps.browse).not.toHaveBeenCalled();
        expect(result).toEqual({ label: 'Notebooks', url, categoryId: 1, params: { ram: ['16'] }, status: 'ok' });
    });

    it('filtros editados con resultados en browse: ok', async () => {
        deps.browse.mockResolvedValue([ENTRY]);
        const result = await run(input({ categoryId: 3, params: {} }));
        expect(deps.browse).toHaveBeenCalledWith(3, {});
        expect(deps.resolveUrl).not.toHaveBeenCalled();
        expect(result).toMatchObject({ categoryId: 3, params: {}, status: 'ok' });
    });

    it('filtros editados sin resultados: needs_review', async () => {
        deps.browse.mockResolvedValue([]);
        expect((await run(input({ params: { bus: ['9'] } }))).status).toBe('needs_review');
    });

    it('filtros editados y browse lanza: needs_review', async () => {
        deps.browse.mockRejectedValue(new Error('500'));
        expect((await run(input({ categoryId: 3 }))).status).toBe('needs_review');
    });

    it('categoryId null: needs_review sin llamar a browse', async () => {
        const result = await run(input({ categoryId: null }));
        expect(result.status).toBe('needs_review');
        expect(deps.browse).not.toHaveBeenCalled();
    });

    it('cambia url y filtros a la vez: respeta los filtros manuales', async () => {
        deps.browse.mockResolvedValue([ENTRY]);
        const url = 'https://www.solotodo.cl/procesadores';
        const result = await run(input({ url, categoryId: 3, params: {} }));
        expect(deps.resolveUrl).not.toHaveBeenCalled();
        expect(result).toMatchObject({ url, categoryId: 3, params: {}, status: 'ok' });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/resolve-edit.test.ts`
Expected: FAIL, cannot resolve `@/lib/resolve-edit`.

- [ ] **Step 3: Write the implementation**

`src/lib/resolve-edit.ts`:

```ts
import type { ResolvedUrl } from './resolve-url';
import type { BrowseEntry, Params, TrackedUrl, TrackedUrlStatus } from './types';

export interface EditInput {
    label: string;
    url: string; // ya normalizada con parseSolotodoUrl
    categoryId: number | null;
    params: Params;
}

export interface EditDeps {
    resolveUrl(url: string): Promise<ResolvedUrl>;
    browse(categoryId: number, params: Params): Promise<BrowseEntry[]>;
}

export type EditResult = Pick<TrackedUrl, 'label' | 'url' | 'categoryId' | 'params' | 'status'>;

export function sameParams(a: Params, b: Params): boolean {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key, i) => key === keysB[i] && a[key].length === b[key].length && a[key].every((value, j) => value === b[key][j]));
}

async function probeStatus(categoryId: number | null, params: Params, deps: EditDeps): Promise<TrackedUrlStatus> {
    if (categoryId === null) return 'needs_review';
    try {
        return (await deps.browse(categoryId, params)).length > 0 ? 'ok' : 'needs_review';
    } catch {
        return 'needs_review';
    }
}

export async function resolveEdit(current: TrackedUrl, input: EditInput, deps: EditDeps): Promise<EditResult> {
    const filtersChanged = input.categoryId !== current.categoryId || !sameParams(input.params, current.params);
    if (filtersChanged) {
        return { ...input, status: await probeStatus(input.categoryId, input.params, deps) };
    }
    if (input.url === current.url) {
        return { ...input, status: current.status };
    }
    // URL nueva con los filtros de la anterior: se vuelven a detectar, como al crear
    const resolved = await deps.resolveUrl(input.url);
    return { label: input.label, url: resolved.url, categoryId: resolved.categoryId, params: resolved.params, status: resolved.status };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/resolve-edit.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `updateTrackedUrl` to the repo**

In `src/lib/db/repo.ts`, right after `setTrackedUrlActive`:

```ts
export type TrackedUrlUpdate = Partial<Pick<TrackedUrl, 'label' | 'url' | 'categoryId' | 'params' | 'status'>>;

export async function updateTrackedUrl(id: number, data: TrackedUrlUpdate): Promise<TrackedUrl | null> {
    const [row] = await getDb().update(trackedUrls).set(data).where(eq(trackedUrls.id, id)).returning();
    return row ?? null;
}
```

(No repo test: the project has no test database and no existing repo tests. It's covered by typecheck and by the action tests that mock it.)

- [ ] **Step 6: Typecheck and full test run**

Run: `npm run typecheck && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/resolve-edit.ts tests/resolve-edit.test.ts src/lib/db/repo.ts
git commit -m "feat: decide status when editing a tracked URL"
```

---

### Task 4: Tracked URL Server Actions

**Files:**
- Create: `src/app/actions/types.ts`
- Create: `src/app/actions/tracked-urls.ts`
- Test: `tests/actions-tracked-urls.test.ts`

**Interfaces:**
- Consumes: Task 1 validators, Task 3 `resolveEdit` / `EditDeps` / `updateTrackedUrl`; existing `createTrackedUrl`, `setTrackedUrlActive`, `deleteTrackedUrl`, `priceRepo.getTrackedUrl`, `resolveUrl`, `parseSolotodoUrl`, `fetchPageHtml`, `InvalidUrlError`, `createSolotodoClient`.
- Produces:
  - `src/app/actions/types.ts`: `type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }` and `type FormState = { kind: 'idle' } | { kind: 'ok' | 'warn'; text: string } | { kind: 'error'; text: string; field?: FormField }`
  - `createTrackedUrlAction(formData: FormData): Promise<FormState>`
  - `updateTrackedUrlAction(formData: FormData): Promise<FormState>`
  - `setTrackedUrlActiveAction(id: number, active: boolean): Promise<ActionResult>`
  - `deleteTrackedUrlAction(id: number): Promise<ActionResult>`
  - Copy: `'No encontrada'`; create ok `'URL agregada. Usa "Sincronizar" para ver su precio.'`; create warn `'URL guardada, pero no se pudo resolver: quedó en revisión.'`; update ok `'Cambios guardados.'`; update warn `'Cambios guardados, pero la URL sigue sin resolver: revisa categoría y parámetros.'`

- [ ] **Step 1: Read the Next docs**

Read `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` (sections "Creating Server Functions" and "Refreshing") and `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`. Confirm `refresh` is imported from `next/cache` and is valid inside a Server Action.

- [ ] **Step 2: Write the failing test**

`tests/actions-tracked-urls.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackedUrl } from '@/lib/types';

vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('@/lib/db/repo', () => ({
    createTrackedUrl: vi.fn(),
    setTrackedUrlActive: vi.fn(),
    deleteTrackedUrl: vi.fn(),
    updateTrackedUrl: vi.fn(),
    priceRepo: { getTrackedUrl: vi.fn() },
}));
vi.mock('@/lib/resolve-url', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/resolve-url')>()),
    resolveUrl: vi.fn(),
}));
vi.mock('@/lib/resolve-edit', () => ({ resolveEdit: vi.fn() }));

import { refresh } from 'next/cache';
import {
    createTrackedUrlAction,
    deleteTrackedUrlAction,
    setTrackedUrlActiveAction,
    updateTrackedUrlAction,
} from '@/app/actions/tracked-urls';
import { createTrackedUrl, deleteTrackedUrl, priceRepo, setTrackedUrlActive, updateTrackedUrl } from '@/lib/db/repo';
import { resolveEdit } from '@/lib/resolve-edit';
import { InvalidUrlError, resolveUrl } from '@/lib/resolve-url';

const ROW: TrackedUrl = {
    id: 1,
    url: 'https://www.solotodo.cl/ssd-m2-pcie-nvme',
    label: 'SSD 2TB',
    categoryId: 39,
    params: {},
    status: 'ok',
    active: true,
    createdAt: new Date('2026-09-28T00:00:00Z'),
};

const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
};

const editForm = (overrides: Record<string, string> = {}) =>
    form({ id: '1', label: ROW.label, url: ROW.url, categoryId: '39', params: '{}', ...overrides });

beforeEach(() => {
    vi.clearAllMocks();
});

describe('createTrackedUrlAction', () => {
    it('error si el nombre está vacío, sin resolver la URL', async () => {
        const state = await createTrackedUrlAction(form({ url: ROW.url, label: '   ' }));
        expect(state).toEqual({ kind: 'error', text: 'El nombre es obligatorio', field: 'label' });
        expect(resolveUrl).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
    });

    it('error con el mensaje de InvalidUrlError', async () => {
        vi.mocked(resolveUrl).mockRejectedValue(new InvalidUrlError('La URL debe ser de solotodo.cl'));
        const state = await createTrackedUrlAction(form({ url: 'https://evil.com', label: 'X' }));
        expect(state).toEqual({ kind: 'error', text: 'La URL debe ser de solotodo.cl', field: 'url' });
    });

    it('guarda la URL resuelta con el label recortado y avisa si quedó en revisión', async () => {
        vi.mocked(resolveUrl).mockResolvedValue({ url: ROW.url, categoryId: 39, params: { bus: ['1'] }, status: 'needs_review' });
        vi.mocked(createTrackedUrl).mockResolvedValue({ ...ROW, status: 'needs_review' });
        const state = await createTrackedUrlAction(form({ url: ROW.url, label: '  SSD 2TB ' }));
        expect(createTrackedUrl).toHaveBeenCalledWith({ url: ROW.url, label: 'SSD 2TB', categoryId: 39, params: { bus: ['1'] }, status: 'needs_review' });
        expect(state.kind).toBe('warn');
        expect(refresh).toHaveBeenCalledOnce();
    });

    it('ok si la URL se resolvió', async () => {
        vi.mocked(resolveUrl).mockResolvedValue({ url: ROW.url, categoryId: 39, params: {}, status: 'ok' });
        vi.mocked(createTrackedUrl).mockResolvedValue(ROW);
        expect(await createTrackedUrlAction(form({ url: ROW.url, label: 'SSD' }))).toEqual({
            kind: 'ok',
            text: 'URL agregada. Usa "Sincronizar" para ver su precio.',
        });
    });
});

describe('setTrackedUrlActiveAction', () => {
    it('rechaza active no boolean', async () => {
        expect(await setTrackedUrlActiveAction(1, 'no' as unknown as boolean)).toEqual({ ok: false, error: 'active debe ser true o false' });
        expect(setTrackedUrlActive).not.toHaveBeenCalled();
    });

    it('No encontrada con id inválido o inexistente', async () => {
        expect(await setTrackedUrlActiveAction('abc' as unknown as number, false)).toEqual({ ok: false, error: 'No encontrada' });
        vi.mocked(setTrackedUrlActive).mockResolvedValue(null);
        expect(await setTrackedUrlActiveAction(99, false)).toEqual({ ok: false, error: 'No encontrada' });
        expect(refresh).not.toHaveBeenCalled();
    });

    it('actualiza active y refresca', async () => {
        vi.mocked(setTrackedUrlActive).mockResolvedValue({ ...ROW, active: false });
        expect(await setTrackedUrlActiveAction(1, false)).toEqual({ ok: true, data: undefined });
        expect(setTrackedUrlActive).toHaveBeenCalledWith(1, false);
        expect(refresh).toHaveBeenCalledOnce();
    });
});

describe('deleteTrackedUrlAction', () => {
    it('borra y refresca; No encontrada si no existe', async () => {
        vi.mocked(deleteTrackedUrl).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        expect(await deleteTrackedUrlAction(1)).toEqual({ ok: true, data: undefined });
        expect(await deleteTrackedUrlAction(2)).toEqual({ ok: false, error: 'No encontrada' });
        expect(refresh).toHaveBeenCalledOnce();
    });
});

describe('updateTrackedUrlAction', () => {
    beforeEach(() => {
        vi.mocked(priceRepo.getTrackedUrl).mockResolvedValue(ROW);
    });

    it('No encontrada si el id no existe', async () => {
        vi.mocked(priceRepo.getTrackedUrl).mockResolvedValue(null);
        expect(await updateTrackedUrlAction(editForm({ id: '99' }))).toEqual({ kind: 'error', text: 'No encontrada' });
        expect(await updateTrackedUrlAction(editForm({ id: 'abc' }))).toEqual({ kind: 'error', text: 'No encontrada' });
        expect(updateTrackedUrl).not.toHaveBeenCalled();
    });

    it.each([
        [{ label: '' }, 'label'],
        [{ url: 'https://evil.com/x' }, 'url'],
        [{ url: 'https://www.solotodo.cl/products/123' }, 'url'],
        [{ categoryId: '-3' }, 'categoryId'],
        [{ params: '{"a": 1}' }, 'params'],
    ])('rechaza %j marcando %s', async (overrides, field) => {
        const state = await updateTrackedUrlAction(editForm(overrides));
        expect(state).toMatchObject({ kind: 'error', field });
        expect(resolveEdit).not.toHaveBeenCalled();
        expect(updateTrackedUrl).not.toHaveBeenCalled();
    });

    it('pasa a resolveEdit la URL normalizada y los valores parseados', async () => {
        vi.mocked(resolveEdit).mockResolvedValue({ label: 'Nuevo', url: ROW.url, categoryId: null, params: { bus: ['1'] }, status: 'needs_review' });
        vi.mocked(updateTrackedUrl).mockResolvedValue({ ...ROW, status: 'needs_review' });
        await updateTrackedUrlAction(editForm({ label: ' Nuevo ', url: `  ${ROW.url}  `, categoryId: '', params: '{ "bus": ["1"] }' }));
        expect(resolveEdit).toHaveBeenCalledWith(ROW, { label: 'Nuevo', url: ROW.url, categoryId: null, params: { bus: ['1'] } }, expect.any(Object));
    });

    it('guarda el resultado, refresca y responde ok', async () => {
        const next = { label: 'Nuevo', url: ROW.url, categoryId: 3, params: {}, status: 'ok' as const };
        vi.mocked(resolveEdit).mockResolvedValue(next);
        vi.mocked(updateTrackedUrl).mockResolvedValue({ ...ROW, ...next });
        expect(await updateTrackedUrlAction(editForm())).toEqual({ kind: 'ok', text: 'Cambios guardados.' });
        expect(updateTrackedUrl).toHaveBeenCalledWith(1, next);
        expect(refresh).toHaveBeenCalledOnce();
    });

    it('warn si sigue en revisión', async () => {
        vi.mocked(resolveEdit).mockResolvedValue({ label: 'X', url: ROW.url, categoryId: null, params: {}, status: 'needs_review' });
        vi.mocked(updateTrackedUrl).mockResolvedValue({ ...ROW, status: 'needs_review' });
        expect((await updateTrackedUrlAction(editForm())).kind).toBe('warn');
    });

    it('No encontrada si la fila se borró mientras se editaba', async () => {
        vi.mocked(resolveEdit).mockResolvedValue({ label: 'X', url: ROW.url, categoryId: 39, params: {}, status: 'ok' });
        vi.mocked(updateTrackedUrl).mockResolvedValue(null);
        expect(await updateTrackedUrlAction(editForm())).toEqual({ kind: 'error', text: 'No encontrada' });
        expect(refresh).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/actions-tracked-urls.test.ts`
Expected: FAIL, cannot resolve `@/app/actions/tracked-urls`.

- [ ] **Step 4: Write the shared types**

`src/app/actions/types.ts`:

```ts
import type { FormField } from '@/lib/validation';

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export type FormState = { kind: 'idle' } | { kind: 'ok' | 'warn'; text: string } | { kind: 'error'; text: string; field?: FormField };
```

- [ ] **Step 5: Write the actions**

`src/app/actions/tracked-urls.ts`:

```ts
'use server';

import { refresh } from 'next/cache';
import { createTrackedUrl, deleteTrackedUrl, priceRepo, setTrackedUrlActive, updateTrackedUrl } from '@/lib/db/repo';
import { resolveEdit } from '@/lib/resolve-edit';
import { InvalidUrlError, type ResolveDeps, fetchPageHtml, parseSolotodoUrl, resolveUrl } from '@/lib/resolve-url';
import { createSolotodoClient } from '@/lib/solotodo';
import { ValidationError, parseCategoryId, parseId, parseLabel, parseParams } from '@/lib/validation';
import type { ActionResult, FormState } from './types';

const NOT_FOUND = 'No encontrada';
const notFound = { ok: false, error: NOT_FOUND } as const;

function resolveDeps(): ResolveDeps {
    const client = createSolotodoClient();
    return {
        fetchHtml: (pageUrl) => fetchPageHtml(pageUrl),
        browse: (categoryId, params) => client.browse(categoryId, params),
    };
}

function toErrorState(error: unknown): FormState {
    if (error instanceof ValidationError) return { kind: 'error', text: error.message, field: error.field };
    if (error instanceof InvalidUrlError) return { kind: 'error', text: error.message, field: 'url' };
    throw error;
}

export async function createTrackedUrlAction(formData: FormData): Promise<FormState> {
    try {
        const label = parseLabel(formData.get('label'));
        const resolved = await resolveUrl(String(formData.get('url') ?? ''), resolveDeps());
        const created = await createTrackedUrl({ ...resolved, label });
        refresh();
        return created.status === 'ok'
            ? { kind: 'ok', text: 'URL agregada. Usa "Sincronizar" para ver su precio.' }
            : { kind: 'warn', text: 'URL guardada, pero no se pudo resolver: quedó en revisión.' };
    } catch (error) {
        return toErrorState(error);
    }
}

export async function updateTrackedUrlAction(formData: FormData): Promise<FormState> {
    const id = parseId(formData.get('id'));
    const current = id === null ? null : await priceRepo.getTrackedUrl(id);
    if (!current) return { kind: 'error', text: NOT_FOUND };

    try {
        const input = {
            label: parseLabel(formData.get('label')),
            url: parseSolotodoUrl(String(formData.get('url') ?? '')).toString(),
            categoryId: parseCategoryId(formData.get('categoryId')),
            params: parseParams(formData.get('params')),
        };
        const deps = resolveDeps();
        const next = await resolveEdit(current, input, {
            resolveUrl: (url) => resolveUrl(url, deps),
            browse: deps.browse,
        });
        const updated = await updateTrackedUrl(current.id, next);
        if (!updated) return { kind: 'error', text: NOT_FOUND };
        refresh();
        return updated.status === 'ok'
            ? { kind: 'ok', text: 'Cambios guardados.' }
            : { kind: 'warn', text: 'Cambios guardados, pero la URL sigue sin resolver: revisa categoría y parámetros.' };
    } catch (error) {
        return toErrorState(error);
    }
}

export async function setTrackedUrlActiveAction(id: number, active: boolean): Promise<ActionResult> {
    if (typeof active !== 'boolean') return { ok: false, error: 'active debe ser true o false' };
    const parsed = parseId(id);
    if (parsed === null) return notFound;
    if (!(await setTrackedUrlActive(parsed, active))) return notFound;
    refresh();
    return { ok: true, data: undefined };
}

export async function deleteTrackedUrlAction(id: number): Promise<ActionResult> {
    const parsed = parseId(id);
    if (parsed === null) return notFound;
    if (!(await deleteTrackedUrl(parsed))) return notFound;
    refresh();
    return { ok: true, data: undefined };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/actions-tracked-urls.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/actions/types.ts src/app/actions/tracked-urls.ts tests/actions-tracked-urls.test.ts
git commit -m "feat: add server actions for tracked URLs"
```

---

### Task 5: Check-prices Server Actions

**Files:**
- Create: `src/app/actions/check-prices.ts`
- Test: `tests/actions-check-prices.test.ts`

**Interfaces:**
- Consumes: `checkPrices(deps, options): Promise<CheckSummary>` and `CheckSummary` from `src/lib/check-prices.ts`; `createCheckDeps()` from `src/lib/deps.ts`; `parseId`; `ActionResult`.
- Produces:
  - `syncTrackedUrlAction(id: number): Promise<ActionResult<CheckSummary>>`
  - `syncAllAction(): Promise<ActionResult<CheckSummary>>`
  - Failure copy: `'No se pudo actualizar ningún precio'`; invalid id: `'No encontrada'`.

- [ ] **Step 1: Write the failing test**

`tests/actions-check-prices.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('@/lib/deps', () => ({ createCheckDeps: vi.fn(() => ({ fake: true })) }));
vi.mock('@/lib/check-prices', () => ({ checkPrices: vi.fn() }));

import { refresh } from 'next/cache';
import { syncAllAction, syncTrackedUrlAction } from '@/app/actions/check-prices';
import { checkPrices } from '@/lib/check-prices';

const SUMMARY = { checked: 1, failed: 0, alerts: 0 };

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkPrices).mockResolvedValue(SUMMARY);
});

describe('syncTrackedUrlAction', () => {
    it.each([0, -1, 1.5, '1abc'])('rechaza id inválido %j', async (id) => {
        expect(await syncTrackedUrlAction(id as number)).toEqual({ ok: false, error: 'No encontrada' });
        expect(checkPrices).not.toHaveBeenCalled();
    });

    it('ejecuta con source manual para esa URL y refresca', async () => {
        expect(await syncTrackedUrlAction(7)).toEqual({ ok: true, data: SUMMARY });
        expect(checkPrices).toHaveBeenCalledWith({ fake: true }, { source: 'manual', trackedUrlId: 7 });
        expect(refresh).toHaveBeenCalledOnce();
    });

    it('error si no se pudo chequear', async () => {
        vi.mocked(checkPrices).mockResolvedValue({ checked: 0, failed: 1, alerts: 0 });
        expect(await syncTrackedUrlAction(7)).toEqual({ ok: false, error: 'No se pudo actualizar ningún precio' });
        expect(refresh).not.toHaveBeenCalled();
    });
});

describe('syncAllAction', () => {
    it('ejecuta sin trackedUrlId', async () => {
        expect(await syncAllAction()).toEqual({ ok: true, data: SUMMARY });
        expect(checkPrices).toHaveBeenCalledWith({ fake: true }, { source: 'manual', trackedUrlId: undefined });
    });

    it('error si no hay nada chequeable', async () => {
        vi.mocked(checkPrices).mockResolvedValue({ checked: 0, failed: 0, alerts: 0 });
        expect((await syncAllAction()).ok).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/actions-check-prices.test.ts`
Expected: FAIL, cannot resolve `@/app/actions/check-prices`.

- [ ] **Step 3: Write the implementation**

`src/app/actions/check-prices.ts`:

```ts
'use server';

import { refresh } from 'next/cache';
import { type CheckSummary, checkPrices } from '@/lib/check-prices';
import { createCheckDeps } from '@/lib/deps';
import { parseId } from '@/lib/validation';
import type { ActionResult } from './types';

async function runManualCheck(trackedUrlId?: number): Promise<ActionResult<CheckSummary>> {
    const summary = await checkPrices(createCheckDeps(), { source: 'manual', trackedUrlId });
    if (summary.checked === 0) return { ok: false, error: 'No se pudo actualizar ningún precio' };
    refresh();
    return { ok: true, data: summary };
}

export async function syncTrackedUrlAction(id: number): Promise<ActionResult<CheckSummary>> {
    const parsed = parseId(id);
    if (parsed === null) return { ok: false, error: 'No encontrada' };
    return runManualCheck(parsed);
}

export async function syncAllAction(): Promise<ActionResult<CheckSummary>> {
    return runManualCheck();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/actions-check-prices.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/check-prices.ts tests/actions-check-prices.test.ts
git commit -m "feat: add server actions to sync prices"
```

---

### Task 6: Migrate AddUrlForm and SyncAllButton

**Files:**
- Create: `src/components/dashboard/form-message.tsx`
- Modify: `src/components/dashboard/add-url-form.tsx` (full rewrite below)
- Modify: `src/components/dashboard/sync-all-button.tsx` (full rewrite below)

**Interfaces:**
- Consumes: `createTrackedUrlAction`, `syncAllAction`, `FormState`.
- Produces: `FormMessage({ state }: { state: FormState })`, `IDLE_STATE: FormState`, `CONNECTION_ERROR: FormState` (used by Task 7).

No unit tests: the project's Vitest runs in `node` with no DOM or React Testing Library. Verified by typecheck, lint and the manual checks in Step 5.

- [ ] **Step 1: Create `form-message.tsx`**

`src/components/dashboard/form-message.tsx`:

```tsx
import type { FormState } from '@/app/actions/types';

export const IDLE_STATE: FormState = { kind: 'idle' };
export const CONNECTION_ERROR: FormState = { kind: 'error', text: 'No se pudo conectar con el servidor.' };

const MESSAGE_CLASS: Record<Exclude<FormState['kind'], 'idle'>, string> = {
    ok: 'text-green-700 dark:text-green-400',
    warn: 'text-amber-700 dark:text-amber-400',
    error: 'text-destructive',
};

export function FormMessage({ state }: { state: FormState }) {
    if (state.kind === 'idle') return null;
    return (
        <p
            role={state.kind === 'error' ? 'alert' : 'status'}
            className={`text-sm ${MESSAGE_CLASS[state.kind]}`}
        >
            {state.text}
        </p>
    );
}
```

- [ ] **Step 2: Rewrite `add-url-form.tsx`**

Replace the whole file with the version below. It keeps the current layout and copy; only the transport, the message component and the "Sincronizar" copy (now in the action) change.

```tsx
'use client';

import { SubmitEvent, useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { createTrackedUrlAction } from '@/app/actions/tracked-urls';
import type { FormState } from '@/app/actions/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CONNECTION_ERROR, FormMessage, IDLE_STATE } from './form-message';

export function AddUrlForm() {
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const [state, setState] = useState<FormState>(IDLE_STATE);
    const invalid = (field: string) => state.kind === 'error' && state.field === field;

    function onSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setState(IDLE_STATE);

        startTransition(async () => {
            const result = await createTrackedUrlAction(data).catch(() => CONNECTION_ERROR);
            // Solo se limpia si se guardó: con error el usuario conserva lo que escribió
            if (result.kind !== 'error') form.reset();
            setState(result);
        });
    }

    return (
        <>
            <Button onClick={() => setOpen(true)}>
                <Plus />
                Agregar URL
            </Button>
            <Dialog
                open={open}
                onOpenChange={setOpen}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Agregar URL</DialogTitle>
                        <DialogDescription>Ingresa la URL del listado de SoloTodo que deseas seguir y un nombre descriptivo.</DialogDescription>
                    </DialogHeader>

                    <form onSubmit={onSubmit}>
                        <div className="flex flex-col gap-4">
                            <label className="space-y-1 text-sm">
                                <span>URL del listado en SoloTodo</span>
                                <Input
                                    name="url"
                                    type="url"
                                    required
                                    aria-invalid={invalid('url')}
                                    placeholder="https://www.solotodo.cl/ssd-m2-pcie-nvme?..."
                                />
                            </label>
                            <label className="space-y-1 text-sm">
                                <span>Nombre</span>
                                <Input
                                    name="label"
                                    type="text"
                                    required
                                    maxLength={100}
                                    aria-invalid={invalid('label')}
                                    placeholder="SSD 2TB NVMe"
                                />
                            </label>
                            <div className="flex items-center gap-3">
                                <Button
                                    type="submit"
                                    disabled={pending}
                                >
                                    {pending ? 'Agregando…' : 'Agregar'}
                                </Button>
                                <FormMessage state={state} />
                            </div>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
```

Before replacing, diff the current file against this version (`git diff` / read it) and carry over any markup that exists in the working copy but not here (the file had uncommitted changes when this plan was written). Only the transport and message parts should differ.

- [ ] **Step 3: Rewrite `sync-all-button.tsx`**

```tsx
'use client';

import { useTransition } from 'react';
import { RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { syncAllAction } from '@/app/actions/check-prices';
import { Button } from '@/components/ui/button';

export function SyncAllButton() {
    const [pending, startTransition] = useTransition();

    function syncAll() {
        startTransition(async () => {
            const promise = syncAllAction().then((result) => (result.ok ? result.data : Promise.reject(new Error(result.error))));
            toast.promise(promise, {
                loading: 'Sincronizando precios…',
                success: (data) => `Sincronizado: ${data.checked} OK${data.failed > 0 ? `, ${data.failed} fallidos` : ''}`,
                error: (error) => (error instanceof Error ? error.message : 'Error al sincronizar precios'),
            });
            // toast.promise muestra el error; aquí solo esperamos para mantener el pending
            await promise.catch(() => undefined);
        });
    }

    return (
        <Button
            type="button"
            variant="outline"
            onClick={syncAll}
            disabled={pending}
        >
            <RefreshCcw className={pending ? 'animate-spin' : 'size-3'} />
            Sincronizar todo
        </Button>
    );
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual check**

Run `npm run dev` (port 4000). Ask the user before doing anything that writes to the real database. With their OK:
- Agregar URL with an empty-after-trim name (e.g. spaces): error under the form, and the URL field keeps its value.
- Agregar URL with `https://evil.com`: error on URL, fields keep their values.
- "Sincronizar todo": spinner while running, success toast, list refreshes.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/form-message.tsx src/components/dashboard/add-url-form.tsx src/components/dashboard/sync-all-button.tsx
git commit -m "refactor: use server actions in add form and sync all button"
```

---

### Task 7: Edit dialog + RowActions migration

**Files:**
- Create: `src/components/ui/textarea.tsx` (shadcn)
- Create: `src/components/dashboard/edit-url-form.tsx`
- Modify: `src/components/dashboard/row-actions.tsx` (full rewrite below)
- Modify: `src/components/dashboard/tracked-url-row.tsx` (`<RowActions … />` props and badge `title`)

**Interfaces:**
- Consumes: `updateTrackedUrlAction`, `setTrackedUrlActiveAction`, `deleteTrackedUrlAction`, `syncTrackedUrlAction`, `ActionResult`, `FormState`, `FormMessage`, `IDLE_STATE`, `CONNECTION_ERROR`, `LABEL_MAX`.
- Produces: `EditUrlForm({ tracked, open, onOpenChange })`, `RowActions({ tracked }: { tracked: TrackedUrl })`.

- [ ] **Step 1: Add the shadcn textarea**

Run: `npx shadcn add textarea`
Expected: creates `src/components/ui/textarea.tsx`. If it imports `cn` from `@/lib/utils`, change it to `import { cn } from 'cn';` to match the other files in `src/components/ui/`. Check `git status` to make sure it only created that file (if it changed `globals.css`, `components.json` or `package.json`, revert those changes and tell the user).

- [ ] **Step 2: Create `edit-url-form.tsx`**

`src/components/dashboard/edit-url-form.tsx`:

```tsx
'use client';

import { SubmitEvent, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { updateTrackedUrlAction } from '@/app/actions/tracked-urls';
import type { FormState } from '@/app/actions/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { TrackedUrl } from '@/lib/types';
import { LABEL_MAX } from '@/lib/validation';
import { CONNECTION_ERROR, FormMessage, IDLE_STATE } from './form-message';

interface Props {
    tracked: TrackedUrl;
    open: boolean;
    onOpenChange(open: boolean): void;
}

export function EditUrlForm({ tracked, open, onOpenChange }: Props) {
    const [pending, startTransition] = useTransition();
    const [state, setState] = useState<FormState>(IDLE_STATE);
    const invalid = (field: string) => state.kind === 'error' && state.field === field;

    function onSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setState(IDLE_STATE);

        startTransition(async () => {
            const result = await updateTrackedUrlAction(data).catch(() => CONNECTION_ERROR);
            if (result.kind === 'ok') {
                toast.success(result.text);
                onOpenChange(false);
                return;
            }
            // warn y error: el dialog queda abierto con lo que el usuario escribió
            setState(result);
        });
    }

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar URL</DialogTitle>
                    <DialogDescription>Si cambias la URL sin tocar categoría ni parámetros, se vuelven a detectar automáticamente.</DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit}>
                    <input
                        type="hidden"
                        name="id"
                        defaultValue={tracked.id}
                    />
                    <div className="flex flex-col gap-4">
                        <label className="space-y-1 text-sm">
                            <span>Nombre</span>
                            <Input
                                name="label"
                                type="text"
                                required
                                maxLength={LABEL_MAX}
                                defaultValue={tracked.label}
                                aria-invalid={invalid('label')}
                            />
                        </label>
                        <label className="space-y-1 text-sm">
                            <span>URL del listado en SoloTodo</span>
                            <Input
                                name="url"
                                type="url"
                                required
                                defaultValue={tracked.url}
                                aria-invalid={invalid('url')}
                            />
                        </label>
                        <label className="space-y-1 text-sm">
                            <span>Categoría SoloTodo</span>
                            <Input
                                name="categoryId"
                                type="number"
                                min={1}
                                step={1}
                                defaultValue={tracked.categoryId ?? ''}
                                aria-invalid={invalid('categoryId')}
                            />
                            <span className="block text-xs text-muted-foreground">ID de categoría en SoloTodo (útil para corregir URLs en revisión)</span>
                        </label>
                        <label className="space-y-1 text-sm">
                            <span>Parámetros</span>
                            <Textarea
                                name="params"
                                rows={5}
                                className="font-mono text-xs"
                                defaultValue={JSON.stringify(tracked.params, null, 2)}
                                aria-invalid={invalid('params')}
                            />
                            <span className="block text-xs text-muted-foreground">Filtros de la URL en formato JSON</span>
                        </label>
                        <div className="flex items-center gap-3">
                            <Button
                                type="submit"
                                disabled={pending}
                            >
                                {pending ? 'Guardando…' : 'Guardar cambios'}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancelar
                            </Button>
                            <FormMessage state={state} />
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 3: Rewrite `row-actions.tsx`**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { EllipsisVertical } from 'lucide-react';
import { syncTrackedUrlAction } from '@/app/actions/check-prices';
import { deleteTrackedUrlAction, setTrackedUrlActiveAction } from '@/app/actions/tracked-urls';
import type { ActionResult } from '@/app/actions/types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { TrackedUrl } from '@/lib/types';
import { EditUrlForm } from './edit-url-form';

export function RowActions({ tracked }: { tracked: TrackedUrl }) {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    // Cambia en cada apertura para remontar el form con los valores actuales
    const [editKey, setEditKey] = useState(0);
    const canRefresh = tracked.status === 'ok';

    function run(action: () => Promise<ActionResult<unknown>>, failure: string) {
        setError(null);
        startTransition(async () => {
            const result = await action().catch(() => null);
            if (!result?.ok) setError(result?.error ?? failure);
        });
    }

    const refresh = () => run(() => syncTrackedUrlAction(tracked.id), 'No se pudo actualizar el precio');

    const toggle = () =>
        run(() => setTrackedUrlActiveAction(tracked.id, !tracked.active), tracked.active ? 'No se pudo pausar' : 'No se pudo reactivar');

    const remove = () => {
        if (!confirm('¿Eliminar esta URL y todo su historial?')) return;
        run(() => deleteTrackedUrlAction(tracked.id), 'No se pudo eliminar');
    };

    const openEdit = () => {
        setEditKey((key) => key + 1);
        setEditOpen(true);
    };

    return (
        // Los eventos de React burbujean a través de los portals del dropdown y el dialog:
        // sin esto, cualquier click aquí abre/cierra el accordion de la tarjeta.
        <div
            className="flex flex-col items-end gap-1"
            onClick={(event) => event.stopPropagation()}
        >
            <div className="flex gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            disabled={pending}
                        >
                            <EllipsisVertical className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-40"
                        align="start"
                    >
                        <DropdownMenuGroup>
                            <DropdownMenuItem onSelect={openEdit}>Editar</DropdownMenuItem>
                            {canRefresh && <DropdownMenuItem onClick={refresh}>Sincronizar</DropdownMenuItem>}
                            <DropdownMenuItem onClick={toggle}>{tracked.active ? 'Pausar' : 'Reactivar'}</DropdownMenuItem>
                            <DropdownMenuItem onClick={remove}>Eliminar</DropdownMenuItem>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {error && (
                <p
                    role="alert"
                    className="text-sm text-destructive"
                >
                    {error}
                </p>
            )}
            {/* Fuera de DropdownMenuContent: evita que Radix deje pointer-events/foco bloqueados */}
            <EditUrlForm
                key={editKey}
                tracked={tracked}
                open={editOpen}
                onOpenChange={setEditOpen}
            />
        </div>
    );
}
```

As in Task 6, diff against the current working copy first and keep any markup that isn't shown here.

- [ ] **Step 4: Update `tracked-url-row.tsx`**

Replace:

```tsx
                            <RowActions
                                id={tracked.id}
                                active={tracked.active}
                                canRefresh={!needsReview}
                            />
```

with:

```tsx
                            <RowActions tracked={tracked} />
```

And on the "Revisión pendiente" badge, change the `title`:

```tsx
                                        title="No se pudo resolver la URL. Usa Editar para corregir categoría y parámetros."
```

- [ ] **Step 5: Typecheck, lint, tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 6: Manual check (ask the user before saving edits against the real DB)**

`npm run dev`, then:
- ⋮ → Editar opens the dialog prefilled with the current values; the card accordion does **not** toggle.
- Clicking inside the dialog (inputs, Cancelar, backdrop) does not toggle the accordion.
- Put `{"a": 1}` in Parámetros → error on that field, and **every field keeps what was typed** (Review Focus).
- Close with Cancelar and reopen → the values are back to the saved ones.
- After closing the dialog, the page is still clickable (no stuck `pointer-events: none` on `<body>`) and focus returns to the ⋮ button.
- Change only the name → toast "Cambios guardados.", dialog closes, card shows the new name.
- On a `needs_review` row, fix category/params → badge disappears and "Sincronizar" shows up in the menu.
- Pausar/Reactivar, Sincronizar and Eliminar still work.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/textarea.tsx src/components/dashboard/edit-url-form.tsx src/components/dashboard/row-actions.tsx src/components/dashboard/tracked-url-row.tsx
git commit -m "feat: edit tracked URLs from the dashboard"
```

---

### Task 8: Remove the replaced API routes

**Files:**
- Delete: `src/app/api/tracked-urls/route.ts`, `src/app/api/tracked-urls/[id]/route.ts`
- Delete: `tests/api-tracked-urls.test.ts` (its cases now live in `tests/actions-tracked-urls.test.ts`)
- Modify: `src/app/api/check-prices/route.ts` (remove `POST`)
- Modify: `tests/api-check-prices.test.ts` (remove the `POST` block)
- Modify: `README.md:48`

- [ ] **Step 1: Confirm nothing else calls the routes**

Run: `grep -rn "api/tracked-urls\|api/check-prices" src scripts tests`
Expected: only `src/app/api/**` itself and `tests/api-*.test.ts`. If a component still `fetch`es them, a previous task is incomplete: stop and fix it there.

- [ ] **Step 2: Delete the routes and their test**

```bash
git rm -r src/app/api/tracked-urls tests/api-tracked-urls.test.ts
```

- [ ] **Step 3: Remove `POST` from `src/app/api/check-prices/route.ts`**

The file must end up as:

```ts
import { checkPrices } from '@/lib/check-prices';
import { createCheckDeps } from '@/lib/deps';

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
        return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    const summary = await checkPrices(createCheckDeps(), { source: 'cron' });
    return Response.json(summary);
}
```

(The working copy had uncommitted changes in this file. Keep any change to `GET` that isn't reflected above; only `POST` goes away.)

- [ ] **Step 4: Update `tests/api-check-prices.test.ts`**

Change the import to `import { GET } from '@/app/api/check-prices/route';` and delete the whole `describe('POST /api/check-prices (manual)', …)` block.

- [ ] **Step 5: Update the README**

In `README.md` line 48, replace:

```
el dashboard y `/api/tracked-urls` no tienen autenticación propia.
```

with:

```
el dashboard y sus Server Actions no tienen autenticación propia.
```

- [ ] **Step 6: Full verification**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green. `next typegen` no longer generates route types for `/api/tracked-urls`.

- [ ] **Step 7: Commit**

```bash
git add -A src/app/api tests/api-check-prices.test.ts README.md
git commit -m "refactor: drop API routes replaced by server actions"
```

---

## Self-Review Notes

- Spec coverage: server actions for all six mutations (Tasks 4, 5), API routes removed with GET cron kept (Task 8), edit dialog + "Editar" item + controlled dialog + `stopPropagation` (Task 7), icons with the verified IDs (Task 2), status recalculation rules 1/2/3 (Task 3), `updateTrackedUrl` with a restricted type (Task 3), shared form messages + "Sincronizar" copy (Task 6), tooltip copy (Task 7), README (Task 8), tests ported and added (Tasks 1–5, 8).
- Intentional deviation: direct action calls inside `startTransition` instead of `useActionState` (see Global Constraints).
