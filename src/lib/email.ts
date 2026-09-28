import { formatCLP } from "./format";
import { productUrl } from "./solotodo";
import type { PriceChangeAlert, ProductChange } from "./types";

export const DEFAULT_ALERT_FROM = "SoloTodo Tracker <onboarding@resend.dev>";

export interface EmailMessage {
  subject: string;
  html: string;
  text: string;
}

export interface ResendLike {
  emails: {
    send(payload: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    }): Promise<{ error: { message: string } | null }>;
  };
}

const MARK = {
  down: { symbol: "↓", color: "#15803d" },
  up: { symbol: "↑", color: "#dc2626" },
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function changed(p: ProductChange): p is ProductChange & { kind: "down" | "up"; previousNormalPrice: number } {
  return (p.kind === "down" || p.kind === "up") && p.previousNormalPrice !== null;
}

function priceHtml(p: ProductChange): string {
  const current = formatCLP(p.normalPrice);
  if (changed(p)) {
    const { symbol, color } = MARK[p.kind];
    return `<s>${formatCLP(p.previousNormalPrice)}</s> → <strong style="color:${color}">${symbol} ${current}</strong>`;
  }
  return p.kind === "new" ? `${current} <em>Nuevo</em>` : current;
}

function priceText(p: ProductChange): string {
  const current = formatCLP(p.normalPrice);
  if (changed(p)) return `${formatCLP(p.previousNormalPrice)} → ${current} ${MARK[p.kind].symbol}`;
  return p.kind === "new" ? `${current} (Nuevo)` : current;
}

export function buildAlertEmail(alert: PriceChangeAlert): EmailMessage {
  const products = alert.products.toSorted((a, b) => a.position - b.position);

  const rows = products.map((p) => {
    const url = escapeHtml(productUrl(p.productId, p.slug));
    return `<tr><td><a href="${url}">${escapeHtml(p.name)}</a></td><td>${priceHtml(p)}</td><td>${formatCLP(p.offerPrice)}</td></tr>`;
  });
  const html = [
    `<p><strong>${escapeHtml(alert.label)}</strong> · <a href="${escapeHtml(alert.listingUrl)}">ver listado</a></p>`,
    `<table cellpadding="6" style="border-collapse:collapse">`,
    `<thead><tr><th align="left">Producto</th><th align="left">Precio normal</th><th align="left">Con medio de pago específico</th></tr></thead>`,
    `<tbody>`,
    ...rows,
    `</tbody>`,
    `</table>`,
  ].join("\n");

  const text = [
    alert.label,
    `Listado: ${alert.listingUrl}`,
    "",
    ...products.map(
      (p) =>
        `${p.name}: ${priceText(p)} · ${formatCLP(p.offerPrice)} con medio de pago específico · ${productUrl(p.productId, p.slug)}`,
    ),
  ].join("\n");

  return { subject: `Hubo cambios de precio en ${alert.label}`, html, text };
}

export function createAlertSender(resend: ResendLike, config: { to: string; from: string }) {
  return async function sendAlert(alert: PriceChangeAlert): Promise<void> {
    const { error } = await resend.emails.send({
      from: config.from,
      to: config.to,
      ...buildAlertEmail(alert),
    });
    if (error) throw new Error(`Resend rechazó el envío: ${error.message}`);
  };
}
