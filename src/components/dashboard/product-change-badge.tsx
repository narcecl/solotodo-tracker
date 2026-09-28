import { Badge } from '@/components/ui/badge';
import { formatCLP } from '@/lib/format';
import type { ProductChange } from '@/lib/types';

export function ProductChangeBadge({ change }: { change: ProductChange }) {
    if (change.kind === 'new') return <Badge variant="outline">Nuevo</Badge>;
    if (change.kind === 'same' || change.previousNormalPrice === null) return null;

    const diff = formatCLP(Math.abs(change.normalPrice - change.previousNormalPrice));
    return change.kind === 'down' ? (
        <Badge
            variant="outline"
            className="border-green-300 text-green-700 dark:border-green-800 dark:text-green-400"
        >
            ↓ bajó {diff}
        </Badge>
    ) : (
        <Badge
            variant="outline"
            className="border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"
        >
            ↑ subió {diff}
        </Badge>
    );
}
