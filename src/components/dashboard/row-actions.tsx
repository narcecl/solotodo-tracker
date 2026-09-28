"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  id: number;
  active: boolean;
  canRefresh: boolean;
}

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
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={pending}>
            {pending ? "…" : "Refrescar ahora"}
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={toggle} disabled={pending}>
          {active ? "Pausar" : "Reactivar"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={remove} disabled={pending}>
          Eliminar
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
