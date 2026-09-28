import { describe, expect, it } from "vitest";
import { formatCLP, formatDateTime } from "@/lib/format";

describe("formatCLP", () => {
  it("formatea pesos chilenos con separador de miles y sin decimales", () => {
    expect(formatCLP(400889)).toBe("$400.889");
    expect(formatCLP(0)).toBe("$0");
  });
});

describe("formatDateTime", () => {
  it("muestra fecha y hora en la zona horaria de Santiago", () => {
    // 12:00 UTC = 09:00 en Santiago (UTC-3 en septiembre)
    const text = formatDateTime(new Date("2026-09-28T12:00:00Z"));

    expect(text).toContain("28-09-2026");
    expect(text).toContain("9:00");
  });
});
