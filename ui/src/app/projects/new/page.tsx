"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNewProject } from "@/components/layout/LayoutContent";

/**
 * La creación vive en el modal desde el rediseño. La ruta se mantiene para que
 * los enlaces antiguos no den 404: redirige al inicio y abre el modal.
 */
export default function NewProjectPage() {
  const router = useRouter();
  const { openNewProject } = useNewProject();

  useEffect(() => {
    router.replace("/");
    openNewProject();
  }, [router, openNewProject]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-ink-3">Abriendo el formulario de proyecto…</p>
    </div>
  );
}
