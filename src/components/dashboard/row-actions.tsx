"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface Props {
  id: number;
  active: boolean;
  canRefresh: boolean;
}

const buttonClass =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function RowActions({ id, active, canRefresh }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(request: () => Promise<Response>, failure: string) {
    setError(null);
    startTransition(async () => {
      const response = await request().catch(() => null);
      if (!response?.ok) {
        setError(failure);
        return;
      }
      router.refresh();
    });
  }

  const refresh = () =>
    run(
      () =>
        fetch("/api/check-prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackedUrlId: id }),
        }),
      "No se pudo actualizar el precio",
    );

  const toggle = () =>
    run(
      () =>
        fetch(`/api/tracked-urls/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !active }),
        }),
      active ? "No se pudo pausar" : "No se pudo reactivar",
    );

  const remove = () => {
    if (!confirm("¿Eliminar esta URL y todo su historial?")) return;
    run(() => fetch(`/api/tracked-urls/${id}`, { method: "DELETE" }), "No se pudo eliminar");
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {canRefresh && (
          <button type="button" className={buttonClass} onClick={refresh} disabled={pending}>
            {pending ? "…" : "Refrescar ahora"}
          </button>
        )}
        <button type="button" className={buttonClass} onClick={toggle} disabled={pending}>
          {active ? "Pausar" : "Reactivar"}
        </button>
        <button type="button" className={buttonClass} onClick={remove} disabled={pending}>
          Eliminar
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
