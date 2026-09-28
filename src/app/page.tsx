import { connection } from 'next/server';
import { buildDashboardRows, recentCheckIds } from '@/lib/dashboard';
import { listAllChecks, listProductsForChecks, listTrackedUrls } from '@/lib/db/repo';
import { AddUrlForm } from '@/components/dashboard/add-url-form';
import { SyncAllButton } from '@/components/dashboard/sync-all-button';
import { TrackedUrlRow } from '@/components/dashboard/tracked-url-row';

export default async function Home() {
    await connection();
    const [urls, checks] = await Promise.all([listTrackedUrls(), listAllChecks()]);
    const productsByCheck = await listProductsForChecks(recentCheckIds(checks));
    const rows = buildDashboardRows(urls, checks, productsByCheck);

    return (
        <main className="mx-auto w-full max-w-4xl px-4 py-10">
            <div className="flex flex-col gap-10">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">SoloTodo Tracker</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <SyncAllButton />
                        <AddUrlForm />
                    </div>
                </div>

                {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Todavía no sigues ningún listado. Pega arriba la URL de un listado de SoloTodo.</p>
                ) : (
                    <ul className="space-y-3">
                        {rows.map((row) => (
                            <TrackedUrlRow
                                key={row.tracked.id}
                                row={row}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </main>
    );
}
