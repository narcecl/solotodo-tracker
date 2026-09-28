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
