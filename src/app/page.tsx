import { connection } from "next/server";
import { buildDashboardRows, recentCheckIds } from "@/lib/dashboard";
import { listAllChecks, listProductsForChecks, listTrackedUrls } from "@/lib/db/repo";
import { AddUrlForm } from "@/components/dashboard/add-url-form";
import { TrackedUrlRow } from "@/components/dashboard/tracked-url-row";

export default async function Home() {
  await connection();
  const [urls, checks] = await Promise.all([listTrackedUrls(), listAllChecks()]);
  const productsByCheck = await listProductsForChecks(recentCheckIds(checks));
  const rows = buildDashboardRows(urls, checks, productsByCheck);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold">SoloTodo Tracker</h1>
      <p className="text-sm text-muted-foreground">
        Precio normal del producto más barato de cada listado. Revisión automática una vez al día.
      </p>
      <AddUrlForm />
      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          Todavía no sigues ningún listado. Pega arriba la URL de un listado de SoloTodo.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {rows.map((row) => (
            <TrackedUrlRow key={row.tracked.id} row={row} />
          ))}
        </ul>
      )}
    </main>
  );
}
