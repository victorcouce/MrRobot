"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * La creación vive en la pantalla de inicio. La ruta se mantiene para que los
 * enlaces antiguos no den 404: redirige al inicio.
 */
export default function NewProjectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-ink-3">Volviendo al inicio…</p>
    </div>
  );
}
