import { formatCLP } from "./format";
import type { PriceDropAlert } from "./types";

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildAlertEmail(alert: PriceDropAlert): EmailMessage {
  const previous = formatCLP(alert.previousPrice);
  const current = formatCLP(alert.newPrice);
  const offer = formatCLP(alert.offerPrice);

  const htmlLines = [
    `<p><strong>${escapeHtml(alert.label)}</strong></p>`,
    `<p><a href="${escapeHtml(alert.productUrl)}">${escapeHtml(alert.productName)}</a></p>`,
    `<p>Precio normal: <s>${previous}</s> → <strong>${current}</strong></p>`,
    `<p>Precio con medio de pago específico: ${offer}</p>`,
  ];
  const textLines = [
    alert.label,
    alert.productName,
    `Precio normal: ${previous} → ${current}`,
    `Precio con medio de pago específico: ${offer}`,
    `Ficha en SoloTodo: ${alert.productUrl}`,
  ];

  if (alert.storeName) {
    const name = escapeHtml(alert.storeName);
    htmlLines.push(
      `<p>Tienda: ${alert.storeUrl ? `<a href="${escapeHtml(alert.storeUrl)}">${name}</a>` : name}</p>`,
    );
    textLines.push(`Tienda: ${alert.storeName}${alert.storeUrl ? ` (${alert.storeUrl})` : ""}`);
  }

  return {
    subject: `Bajó de precio: ${alert.label} · ${current}`,
    html: htmlLines.join("\n"),
    text: textLines.join("\n"),
  };
}

export function createAlertSender(resend: ResendLike, config: { to: string; from: string }) {
  return async function sendAlert(alert: PriceDropAlert): Promise<void> {
    const { error } = await resend.emails.send({
      from: config.from,
      to: config.to,
      ...buildAlertEmail(alert),
    });
    if (error) throw new Error(`Resend rechazó el envío: ${error.message}`);
  };
}
