'use client';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardRow } from '@/lib/dashboard';
import { getCategoryIcon } from '@/lib/category-icons';
import { formatCLP, formatFriendlyDate } from '@/lib/format';
import { OtherProducts } from './other-products';
import { RowActions } from './row-actions';
import { Accordion, AccordionContent, AccordionItem } from '../ui/accordion';
import { cn } from 'cn';
import { Badge } from '../ui/badge';

export function TrackedUrlRow({ row }: { row: DashboardRow }) {
    const { tracked, latest, products } = row;
    const needsReview = tracked.status === 'needs_review';
    const others = products.filter((p) => p.position > 0);
    const Icon = getCategoryIcon(tracked.categoryId);

    const [open, setOpen] = useState(false);

    return (
        <li>
            <Card className="hover:ring-foreground/20 hover:bg-muted/80 transition-all gap-0 p-0!">
                <CardHeader
                    className={cn('flex items-center justify-between py-4', { 'cursor-pointer': others.length > 0 })}
                    onClick={() => setOpen((o) => !o)}
                >
                    <div className="flex items-center gap-4">
                        <div className="flex size-11 items-center justify-center rounded-md border">
                            <Icon className="size-5 text-muted-foreground" />
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <CardTitle>{tracked.label}</CardTitle>
                                {!tracked.active && <Badge variant="secondary">Pausada</Badge>}
                                {needsReview && (
                                    <Badge
                                        variant="outline"
                                        className="border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300"
                                        title="No se pudo resolver la URL. Corrige category_id y params en la base de datos."
                                    >
                                        ⚠ Revisión pendiente
                                    </Badge>
                                )}
                            </div>
                            <CardDescription className="text-sm lowercase">
                                {products.length} productos {latest?.storeName && `· Último chequeo ${formatFriendlyDate(latest.checkedAt)}`}
                            </CardDescription>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        {latest ? (
                            <div className="flex flex-col text-right">
                                <span className="text-lg font-semibold">{formatCLP(latest.offerPrice)}</span>
                                <span className="text-xs text-muted-foreground">{formatCLP(latest.normalPrice)}</span>
                            </div>
                        ) : null}
                        <div className="flex items-center gap-2">
                            <RowActions
                                id={tracked.id}
                                active={tracked.active}
                                canRefresh={!needsReview}
                            />
                        </div>
                    </div>
                </CardHeader>

                <CardContent>
                    <Accordion
                        type="single"
                        value={open ? 'others' : ''}
                        onValueChange={(value) => setOpen(value === 'others')}
                        collapsible
                    >
                        <AccordionItem
                            value="others"
                            className="border-b-0"
                        >
                            <AccordionContent className="pb-4">
                                {/* <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0 flex-1 space-y-1">
                                            {latest && productUrl ? (
                                                <>
                                                    <a
                                                        href={productUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className={`block truncate text-sm ${linkClass}`}
                                                    >
                                                        {latest.productName}
                                                    </a>
                                                    <p className="flex flex-wrap items-baseline gap-x-2">
                                                        <span className="text-lg font-semibold">{formatCLP(latest.normalPrice)}</span>
                                                        <span className="text-sm text-muted-foreground">
                                                            {formatCLP(latest.offerPrice)} oferta / efectivo
                                                        </span>
                                                        {trend && previous && (
                                                            <span className={`text-sm ${TREND[trend].className}`}>
                                                                {TREND[trend].symbol} {TREND[trend].label}
                                                                {trend !== 'same' && ` ${formatCLP(Math.abs(latest.normalPrice - previous.normalPrice))}`}
                                                            </span>
                                                        )}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {latest.storeName && (
                                                            <>
                                                                Tienda:{' '}
                                                                {latest.storeUrl ? (
                                                                    <a
                                                                        href={latest.storeUrl}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className={linkClass}
                                                                    >
                                                                        {latest.storeName}
                                                                    </a>
                                                                ) : (
                                                                    latest.storeName
                                                                )}
                                                            </>
                                                        )}
                                                    </p>
                                                </>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">
                                                    {needsReview
                                                        ? 'Sin chequeos: la URL necesita revisión.'
                                                        : 'Sin chequeos todavía. Usa "Refrescar ahora".'}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <Sparkline values={history} />
                                        </div>
                                    </div> */}
                                {others.length > 0 && <OtherProducts products={products} />}
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </CardContent>
            </Card>
        </li>
    );
}
