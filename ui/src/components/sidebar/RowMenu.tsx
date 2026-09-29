"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, MoreHorizontal } from "lucide-react";
import { clsx } from "@/lib/cx";

export interface MenuAction {
  kind?: "item";
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Motivo cuando está desactivada. */
  hint?: string;
}

export interface MenuChoice {
  id: string;
  label: string;
  icon?: ReactNode;
  current?: boolean;
  onSelect: () => void;
}

export interface MenuSubmenu {
  kind: "submenu";
  label: string;
  icon: ReactNode;
  items: MenuChoice[];
  emptyLabel?: string;
}

export type MenuEntry = MenuAction | MenuSubmenu | { kind: "separator" };

export interface RowMenuHandle {
  /** Abre el menú en el puntero (clic derecho). */
  openAt: (x: number, y: number) => void;
}

const MENU_WIDTH = 224;
const SUBMENU_WIDTH = 240;
const GAP = 4;

const ITEM_CLASS =
  "flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors duration-75 disabled:pointer-events-none disabled:opacity-40";

function clampPosition(x: number, y: number, width: number, height: number) {
  const maxX = window.innerWidth - width - 8;
  const maxY = window.innerHeight - height - 8;
  return { x: Math.max(8, Math.min(x, maxX)), y: Math.max(8, Math.min(y, maxY)) };
}

function focusables(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return [
    ...container.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
  ];
}

function moveFocus(container: HTMLElement | null, delta: 1 | -1) {
  const items = focusables(container);
  if (items.length === 0) return;
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = index === -1 ? (delta === 1 ? 0 : items.length - 1) : (index + delta + items.length) % items.length;
  items[next]?.focus();
}

/**
 * Menú «⋯» de una fila de la barra lateral, como el de ChatGPT: se abre con el
 * botón o con clic derecho, se navega con flechas y los submenús (mover a
 * proyecto) salen al lado.
 */
export const RowMenu = forwardRef<
  RowMenuHandle,
  {
    label: string;
    items: MenuEntry[];
    /** El botón solo se ve al pasar por la fila, salvo con el menú abierto. */
    triggerClassName?: string;
    onOpenChange?: (open: boolean) => void;
  }
>(function RowMenu({ label, items, triggerClassName, onOpenChange }, ref) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [submenu, setSubmenu] = useState<{ index: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const open = anchor !== null;

  const close = useCallback((restoreFocus = false) => {
    setAnchor(null);
    setPosition(null);
    setSubmenu(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useImperativeHandle(ref, () => ({
    openAt: (x, y) => {
      setSubmenu(null);
      setAnchor({ x, y });
    },
  }));

  function toggleFromTrigger() {
    if (open) {
      close();
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({ x: rect.left, y: rect.bottom + GAP });
  }

  // Se coloca tras medir: nunca se sale de la ventana.
  useLayoutEffect(() => {
    if (!anchor) return;
    const height = menuRef.current?.offsetHeight ?? 0;
    setPosition(clampPosition(anchor.x, anchor.y, MENU_WIDTH, height));
  }, [anchor]);

  useEffect(() => {
    if (position) focusables(menuRef.current)[0]?.focus();
  }, [position]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        submenuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      close();
    };
    const onDismiss = () => close();
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("blur", onDismiss);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("blur", onDismiss);
    };
  }, [open, close]);

  function openSubmenu(index: number, element: HTMLElement, focusFirst = false) {
    const menuRect = menuRef.current?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    if (!menuRect) return;
    setSubmenu({ index, top: rect.top - 6 });
    if (focusFirst) {
      requestAnimationFrame(() => focusables(submenuRef.current)[0]?.focus());
    }
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus(menuRef.current, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(menuRef.current, -1);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        event.preventDefault();
        break;
    }
  }

  function onSubmenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus(submenuRef.current, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(submenuRef.current, -1);
        break;
      case "ArrowLeft":
      case "Escape": {
        event.preventDefault();
        event.stopPropagation();
        const index = submenu?.index;
        setSubmenu(null);
        const trigger = menuRef.current?.querySelector<HTMLElement>(
          `[data-submenu-index="${index}"]`,
        );
        trigger?.focus();
        break;
      }
      case "Tab":
        event.preventDefault();
        break;
    }
  }

  const active = submenu ? items[submenu.index] : undefined;
  const activeSubmenu = active && active.kind === "submenu" ? active : undefined;
  const menuLeft = position?.x ?? 0;
  const opensLeft =
    typeof window !== "undefined" &&
    menuLeft + MENU_WIDTH + SUBMENU_WIDTH + GAP > window.innerWidth - 8;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Más opciones"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleFromTrigger();
        }}
        className={clsx(
          "focus-ring flex h-6 w-6 items-center justify-center rounded-md text-ink-4 hover:bg-line-strong/60 hover:text-ink",
          open ? "bg-line-strong/60 text-ink opacity-100" : triggerClassName,
        )}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {open &&
        createPortal(
          <>
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              onKeyDown={onMenuKeyDown}
              style={{
                left: position?.x ?? anchor.x,
                top: position?.y ?? anchor.y,
                width: MENU_WIDTH,
                visibility: position ? "visible" : "hidden",
              }}
              className="row-menu fixed z-[60] flex flex-col rounded-[12px] border border-line bg-surface p-1.5 shadow-modal"
            >
              {items.map((entry, index) => {
                if (entry.kind === "separator") {
                  return <div key={`sep-${index}`} role="separator" className="mx-1.5 my-1 h-px bg-line" />;
                }

                if (entry.kind === "submenu") {
                  const expanded = submenu?.index === index;
                  return (
                    <button
                      key={entry.label}
                      type="button"
                      role="menuitem"
                      aria-haspopup="menu"
                      aria-expanded={expanded}
                      data-submenu-index={index}
                      onMouseEnter={(event) => openSubmenu(index, event.currentTarget)}
                      onClick={(event) => openSubmenu(index, event.currentTarget, true)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openSubmenu(index, event.currentTarget, true);
                        }
                      }}
                      className={clsx(
                        ITEM_CLASS,
                        "text-ink-2 hover:bg-muted focus:bg-muted",
                        expanded && "bg-muted",
                      )}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{entry.icon}</span>
                      <span className="flex-1 truncate">{entry.label}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-ink-4" aria-hidden />
                    </button>
                  );
                }

                return (
                  <button
                    key={entry.label}
                    type="button"
                    role="menuitem"
                    disabled={entry.disabled}
                    title={entry.disabled ? entry.hint : undefined}
                    onMouseEnter={() => setSubmenu(null)}
                    onClick={() => {
                      close();
                      entry.onSelect();
                    }}
                    className={clsx(
                      ITEM_CLASS,
                      entry.danger
                        ? "text-danger-text hover:bg-danger-soft focus:bg-danger-soft"
                        : "text-ink-2 hover:bg-muted focus:bg-muted",
                    )}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">{entry.icon}</span>
                    <span className="flex-1 truncate">{entry.label}</span>
                  </button>
                );
              })}
            </div>

            {activeSubmenu && position && submenu && (
              <div
                ref={submenuRef}
                role="menu"
                aria-label={activeSubmenu.label}
                onKeyDown={onSubmenuKeyDown}
                style={{
                  left: opensLeft
                    ? Math.max(8, menuLeft - SUBMENU_WIDTH - GAP)
                    : menuLeft + MENU_WIDTH + GAP,
                  top: Math.max(8, Math.min(submenu.top, window.innerHeight - 320)),
                  width: SUBMENU_WIDTH,
                }}
                className="row-menu fixed z-[61] flex max-h-[300px] flex-col overflow-y-auto rounded-[12px] border border-line bg-surface p-1.5 shadow-modal"
              >
                {activeSubmenu.items.length === 0 ? (
                  <p className="px-2.5 py-2 text-[12.5px] text-ink-4">
                    {activeSubmenu.emptyLabel ?? "No hay opciones"}
                  </p>
                ) : (
                  activeSubmenu.items.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      role="menuitem"
                      disabled={choice.current}
                      aria-current={choice.current ? "true" : undefined}
                      onClick={() => {
                        close();
                        choice.onSelect();
                      }}
                      className={clsx(ITEM_CLASS, "text-ink-2 hover:bg-muted focus:bg-muted disabled:opacity-100")}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{choice.icon}</span>
                      <span className="flex-1 truncate">{choice.label}</span>
                      {choice.current && <Check className="h-3.5 w-3.5 text-ink-4" aria-hidden />}
                    </button>
                  ))
                )}
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  );
});
