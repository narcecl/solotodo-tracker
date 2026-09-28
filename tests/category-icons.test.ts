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
