import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardRow, Trend } from "@/lib/dashboard";
import { formatCLP, formatDateTime } from "@/lib/format";
import { RowActions } from "./row-actions";
import { Sparkline } from "./sparkline";

const TREND: Record<Trend, { symbol: string; label: string; className: string }> = {
  down: { symbol: "↓", label: "bajó", className: "text-green-600 dark:text-green-400" },
  up: { symbol: "↑", label: "subió", className: "text-red-600 dark:text-red-400" },
  same: { symbol: "—", label: "sin cambio", className: "text-muted-foreground" },
};

const linkClass = "underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-current";

export function TrackedUrlRow({ row }: { row: DashboardRow }) {
  const { tracked, latest, previous, trend, productUrl, history } = row;
  const needsReview = tracked.status === "needs_review";

  return (
    <li>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
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
            <a href={tracked.url} target="_blank" rel="noreferrer" className={`text-xs text-muted-foreground ${linkClass}`}>
              ver listado
            </a>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            {latest && productUrl ? (
              <>
                <a href={productUrl} target="_blank" rel="noreferrer" className={`block truncate text-sm ${linkClass}`}>
                  {latest.productName}
                </a>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-lg font-semibold">{formatCLP(latest.normalPrice)}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatCLP(latest.offerPrice)} con medio de pago específico
                  </span>
                  {trend && previous && (
                    <span className={`text-sm ${TREND[trend].className}`}>
                      {TREND[trend].symbol} {TREND[trend].label}
                      {trend !== "same" &&
                        ` ${formatCLP(Math.abs(latest.normalPrice - previous.normalPrice))}`}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {latest.storeName && (
                    <>
                      Tienda:{" "}
                      {latest.storeUrl ? (
                        <a href={latest.storeUrl} target="_blank" rel="noreferrer" className={linkClass}>
                          {latest.storeName}
                        </a>
                      ) : (
                        latest.storeName
                      )}
                      {" · "}
                    </>
                  )}
                  Último chequeo: {formatDateTime(latest.checkedAt)}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {needsReview
                  ? "Sin chequeos: la URL necesita revisión."
                  : "Sin chequeos todavía. Usa \"Refrescar ahora\"."}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <Sparkline values={history} />
            <RowActions id={tracked.id} active={tracked.active} canRefresh={!needsReview} />
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
