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
