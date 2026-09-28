import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/deps", () => ({ createCheckDeps: vi.fn(() => ({ fake: true })) }));
vi.mock("@/lib/check-prices", () => ({ checkPrices: vi.fn() }));

import { GET, POST } from "@/app/api/check-prices/route";
import { checkPrices } from "@/lib/check-prices";

const mockedCheckPrices = vi.mocked(checkPrices);
const URL_ = "http://localhost/api/check-prices";

beforeEach(() => {
  mockedCheckPrices.mockReset();
  mockedCheckPrices.mockResolvedValue({ checked: 1, failed: 0, alerts: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/check-prices (cron)", () => {
  it("401 sin header de autorización", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await GET(new Request(URL_));
    expect(res.status).toBe(401);
    expect(mockedCheckPrices).not.toHaveBeenCalled();
  });

  it("401 con secreto incorrecto", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await GET(new Request(URL_, { headers: { Authorization: "Bearer otro" } }));
    expect(res.status).toBe(401);
  });

  it("401 si CRON_SECRET no está configurado", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(new Request(URL_, { headers: { Authorization: "Bearer " } }));
    expect(res.status).toBe(401);
    expect(mockedCheckPrices).not.toHaveBeenCalled();
  });

  it("200 y ejecuta con source cron cuando el secreto coincide", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await GET(new Request(URL_, { headers: { Authorization: "Bearer s3cret" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 1, failed: 0, alerts: 0 });
    expect(mockedCheckPrices).toHaveBeenCalledWith({ fake: true }, { source: "cron" });
  });
});

describe("POST /api/check-prices (manual)", () => {
  const post = (body: unknown) =>
    POST(new Request(URL_, { method: "POST", body: JSON.stringify(body) }));

  it.each([{}, { trackedUrlId: "1" }, { trackedUrlId: 0 }, { trackedUrlId: 1.5 }])(
    "400 con body inválido %j",
    async (body) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(mockedCheckPrices).not.toHaveBeenCalled();
    },
  );

  it("ejecuta con source manual para esa URL", async () => {
    const res = await post({ trackedUrlId: 7 });
    expect(res.status).toBe(200);
    expect(mockedCheckPrices).toHaveBeenCalledWith(
      { fake: true },
      { source: "manual", trackedUrlId: 7 },
    );
  });

  it("502 si no se pudo chequear", async () => {
    mockedCheckPrices.mockResolvedValue({ checked: 0, failed: 1, alerts: 0 });
    const res = await post({ trackedUrlId: 7 });
    expect(res.status).toBe(502);
  });
});
