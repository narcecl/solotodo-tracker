import type { DashboardRow, Trend } from "@/lib/dashboard";
import { formatCLP, formatDateTime } from "@/lib/format";
import { RowActions } from "./row-actions";
import { Sparkline } from "./sparkline";

const TREND: Record<Trend, { symbol: string; label: string; className: string }> = {
  down: { symbol: "↓", label: "bajó", className: "text-green-600" },
  up: { symbol: "↑", label: "subió", className: "text-red-600" },
  same: { symbol: "—", label: "sin cambio", className: "text-zinc-500" },
};

const linkClass = "underline decoration-zinc-300 underline-offset-2 hover:decoration-current";

export function TrackedUrlRow({ row }: { row: DashboardRow }) {
  const { tracked, latest, previous, trend, productUrl, history } = row;
  const needsReview = tracked.status === "needs_review";

  return (
    <li className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">{tracked.label}</h2>
          {!tracked.active && (
            <span className="rounded bg-zinc-100 px-1.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              Pausada
            </span>
          )}
          {needsReview && (
            <span
              className="rounded bg-amber-100 px-1.5 text-xs text-amber-800"
              title="No se pudo resolver la URL. Corrige category_id y params en la base de datos."
            >
              ⚠ Revisión pendiente
            </span>
          )}
          <a href={tracked.url} target="_blank" rel="noreferrer" className={`text-xs text-zinc-500 ${linkClass}`}>
            ver listado
          </a>
        </div>

        {latest && productUrl ? (
          <>
            <a href={productUrl} target="_blank" rel="noreferrer" className={`block truncate text-sm ${linkClass}`}>
              {latest.productName}
            </a>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-lg font-semibold">{formatCLP(latest.normalPrice)}</span>
              <span className="text-sm text-zinc-500">
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
            <p className="text-xs text-zinc-500">
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
          <p className="text-sm text-zinc-500">
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
    </li>
  );
}
