import { checkPrices } from "@/lib/check-prices";
import { createCheckDeps } from "@/lib/deps";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const summary = await checkPrices(createCheckDeps(), { source: "cron" });
  return Response.json(summary);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { trackedUrlId?: unknown } | null;
  const trackedUrlId = body?.trackedUrlId;
  if (typeof trackedUrlId !== "number" || !Number.isInteger(trackedUrlId) || trackedUrlId <= 0) {
    return Response.json({ error: "trackedUrlId inválido" }, { status: 400 });
  }
  const summary = await checkPrices(createCheckDeps(), { source: "manual", trackedUrlId });
  if (summary.checked !== 1) {
    return Response.json({ error: "No se pudo actualizar el precio" }, { status: 502 });
  }
  return Response.json(summary);
}
