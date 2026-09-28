import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCLP } from '@/lib/format';
import { productUrl } from '@/lib/solotodo';
import type { ProductChange } from '@/lib/types';
import { ProductChangeBadge } from './product-change-badge';

const linkClass = 'underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-current';

export function OtherProducts({ products }: { products: ProductChange[] }) {
    return (
        <Accordion
            type="single"
            collapsible
        >
            <AccordionItem
                value="others"
                className="border-b-0"
            >
                <AccordionTrigger className="py-2 text-sm">
                    Ver {products.length} {products.length === 1 ? 'producto' : 'productos'} más
                </AccordionTrigger>
                <AccordionContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Producto</TableHead>
                                <TableHead className="text-right">Precio normal</TableHead>
                                <TableHead className="hidden text-right sm:table-cell">Medio de pago específico</TableHead>
                                <TableHead>
                                    <span className="sr-only">Cambio</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {products.map((p) => (
                                <TableRow key={p.position}>
                                    <TableCell>
                                        <div className="max-w-[16rem] truncate">
                                            <a
                                                href={productUrl(p.productId, p.slug)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className={linkClass}
                                            >
                                                {p.name}
                                            </a>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-medium">{formatCLP(p.normalPrice)}</TableCell>
                                    <TableCell className="hidden text-right text-muted-foreground sm:table-cell">{formatCLP(p.offerPrice)}</TableCell>
                                    <TableCell className="text-right">
                                        <ProductChangeBadge change={p} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}
