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
