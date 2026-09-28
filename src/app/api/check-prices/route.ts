import { checkPrices } from '@/lib/check-prices';
import { createCheckDeps } from '@/lib/deps';

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
        return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    const summary = await checkPrices(createCheckDeps(), { source: 'cron' });
    return Response.json(summary);
}
