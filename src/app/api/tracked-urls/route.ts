import { createTrackedUrl } from '@/lib/db/repo';
import { InvalidUrlError, fetchPageHtml, resolveUrl } from '@/lib/resolve-url';
import { createSolotodoClient } from '@/lib/solotodo';

export async function POST(request: Request) {
    const body = (await request.json().catch(() => null)) as { url?: unknown; label?: unknown } | null;
    const url = typeof body?.url === 'string' ? body.url : '';
    const label = typeof body?.label === 'string' ? body.label.trim() : '';
    if (!label) return Response.json({ error: 'El nombre es obligatorio' }, { status: 400 });

    const client = createSolotodoClient();
    try {
        const resolved = await resolveUrl(url, {
            fetchHtml: (pageUrl) => fetchPageHtml(pageUrl),
            browse: (categoryId, params) => client.browse(categoryId, params),
        });
        const created = await createTrackedUrl({ ...resolved, label });
        return Response.json(created, { status: 201 });
    } catch (error) {
        if (error instanceof InvalidUrlError) {
            return Response.json({ error: error.message }, { status: 400 });
        }
        throw error;
    }
}
