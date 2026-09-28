import { describe, expect, it, vi } from "vitest";
import { buildAlertEmail, createAlertSender, type ResendLike } from "@/lib/email";
import type { PriceDropAlert } from "@/lib/types";

const ALERT: PriceDropAlert = {
  label: "SSD 2TB",
  productName: "A-DATA XPG Gammix S70 BLADE 2 TB",
  productUrl: "https://www.solotodo.cl/products/127681-a-data-xpg",
  previousPrice: 420000,
  newPrice: 400889,
  offerPrice: 379990,
  storeName: "MyShop",
  storeUrl: "https://myshop.cl/p26990",
};

describe("buildAlertEmail", () => {
  it("incluye label, producto, precios y tienda", () => {
    const email = buildAlertEmail(ALERT);
    expect(email.subject).toBe("Bajó de precio: SSD 2TB · $400.889");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("SSD 2TB");
      expect(part).toContain("A-DATA XPG Gammix S70 BLADE 2 TB");
      expect(part).toContain("$420.000");
      expect(part).toContain("$400.889");
      expect(part).toContain("$379.990");
      expect(part).toContain("MyShop");
      expect(part).toContain("https://www.solotodo.cl/products/127681-a-data-xpg");
    }
    expect(email.html).toContain('<a href="https://myshop.cl/p26990">MyShop</a>');
  });

  it("omite la tienda cuando no hay", () => {
    const email = buildAlertEmail({ ...ALERT, storeName: null, storeUrl: null });
    expect(email.html).not.toContain("Tienda");
    expect(email.text).not.toContain("Tienda");
  });

  it("escapa HTML en textos del usuario y de SoloTodo", () => {
    const email = buildAlertEmail({ ...ALERT, label: "SSD <b>&</b>", productName: 'Disco "X" <script>' });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("SSD &lt;b&gt;&amp;&lt;/b&gt;");
    expect(email.html).toContain("Disco &quot;X&quot; &lt;script&gt;");
  });
});

describe("createAlertSender", () => {
  function fakeResend(result: { error: { message: string } | null }) {
    const send = vi.fn<ResendLike["emails"]["send"]>(async () => result);
    return { resend: { emails: { send } } satisfies ResendLike, send };
  }

  it("envía con from/to configurados", async () => {
    const { resend, send } = fakeResend({ error: null });
    await createAlertSender(resend, { to: "hola@narce.cl", from: "Tracker <a@b.cl>" })(ALERT);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Tracker <a@b.cl>",
        to: "hola@narce.cl",
        subject: "Bajó de precio: SSD 2TB · $400.889",
      }),
    );
  });

  it("lanza si Resend devuelve error sin lanzar", async () => {
    const { resend } = fakeResend({ error: { message: "domain not verified" } });
    await expect(
      createAlertSender(resend, { to: "hola@narce.cl", from: "x@y.cl" })(ALERT),
    ).rejects.toThrow("domain not verified");
  });
});
