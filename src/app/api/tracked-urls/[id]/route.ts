import { deleteTrackedUrl, setTrackedUrlActive } from '@/lib/db/repo';

function parseId(raw: string): number | null {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
}

const notFound = () => Response.json({ error: 'No encontrada' }, { status: 404 });

export async function PATCH(request: Request, ctx: RouteContext<'/api/tracked-urls/[id]'>) {
    const body = (await request.json().catch(() => null)) as { active?: unknown } | null;
    if (typeof body?.active !== 'boolean') {
        return Response.json({ error: 'active debe ser true o false' }, { status: 400 });
    }
    const id = parseId((await ctx.params).id);
    if (id === null) return notFound();
    const updated = await setTrackedUrlActive(id, body.active);
    return updated ? Response.json(updated) : notFound();
}

export async function DELETE(_request: Request, ctx: RouteContext<'/api/tracked-urls/[id]'>) {
    const id = parseId((await ctx.params).id);
    if (id === null) return notFound();
    return (await deleteTrackedUrl(id)) ? new Response(null, { status: 204 }) : notFound();
}
