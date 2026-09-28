"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

type Message = { kind: "ok" | "warn" | "error"; text: string };

const MESSAGE_CLASS: Record<Message["kind"], string> = {
  ok: "text-green-700",
  warn: "text-amber-700",
  error: "text-red-600",
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export function AddUrlForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/tracked-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: data.get("url"), label: data.get("label") }),
      }).catch(() => null);

      if (!response) {
        setMessage({ kind: "error", text: "No se pudo conectar con el servidor." });
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!response.ok) {
        setMessage({ kind: "error", text: body.error ?? "No se pudo agregar la URL." });
        return;
      }
      form.reset();
      setMessage(
        body.status === "ok"
          ? { kind: "ok", text: "URL agregada. Usa \"Refrescar ahora\" para ver su precio." }
          : { kind: "warn", text: "URL guardada, pero no se pudo resolver: quedó en revisión." },
      );
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <label className="space-y-1 text-sm">
          <span>URL del listado en SoloTodo</span>
          <input name="url" type="url" required placeholder="https://www.solotodo.cl/ssd-m2-pcie-nvme?..." className={inputClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Nombre</span>
          <input name="label" type="text" required maxLength={100} placeholder="SSD 2TB NVMe" className={inputClass} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Agregando…" : "Agregar"}
        </button>
        {message && (
          <p role="status" className={`text-sm ${MESSAGE_CLASS[message.kind]}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
