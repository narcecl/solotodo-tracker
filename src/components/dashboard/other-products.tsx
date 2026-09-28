import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCLP } from '@/lib/format';
import { productUrl } from '@/lib/solotodo';
import type { ProductChange } from '@/lib/types';
import { ProductChangeBadge } from './product-change-badge';

export function OtherProducts({ products }: { products: ProductChange[] }) {
    return (
        <div className="border rounded-md">
            <Table>
                <TableHeader className="bg-muted-foreground/10">
                    <TableRow>
                        <TableHead className="font-medium">Producto</TableHead>
                        <TableHead className="font-medium hidden text-right sm:table-cell">Precio efectivo</TableHead>
                        <TableHead className="font-medium text-right">Precio normal</TableHead>
                        <TableHead className="font-medium">
                            <span className="sr-only">Cambio</span>
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {products.map((p) => (
                        <TableRow key={p.position}>
                            <TableCell>
                                <div className="truncate">
                                    <a
                                        href={productUrl(p.productId, p.slug)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="no-underline! hover:underline!"
                                    >
                                        {p.name}
                                    </a>
                                </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatCLP(p.offerPrice)}</TableCell>
                            <TableCell className="hidden text-right text-muted-foreground sm:table-cell">{formatCLP(p.normalPrice)}</TableCell>
                            <TableCell className="text-right">
                                <ProductChangeBadge change={p} />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
