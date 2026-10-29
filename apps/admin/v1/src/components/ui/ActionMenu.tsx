import { useEffect, useId, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

export type EntityAction = {
  label: string;
  onSelect: () => void;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
};
export function ActionMenu({
  label,
  items,
  disabled = false,
}: {
  label: string;
  items: EntityAction[];
  disabled?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const anchorPosition = useRef<{ top: number; left: number } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (
        event.type === "scroll" &&
        event.target instanceof Node &&
        menu.current?.contains(event.target)
      )
        return;
      if (event.type === "scroll") {
        const rect = trigger.current?.getBoundingClientRect();
        if (
          rect &&
          anchorPosition.current &&
          rect.top === anchorPosition.current.top &&
          rect.left === anchorPosition.current.left
        )
          return;
      }
      menu.current?.hidePopover();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);
  function buttons() {
    return Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? [],
    );
  }
  function show(last = false) {
    const anchor = trigger.current,
      panel = menu.current;
    if (!anchor || !panel) return;
    panel.showPopover();
    const rect = anchor.getBoundingClientRect(),
      bounds = panel.getBoundingClientRect();
    anchorPosition.current = { top: rect.top, left: rect.left };
    panel.style.left =
      Math.max(
        12,
        Math.min(rect.right - bounds.width, innerWidth - bounds.width - 12),
      ) + "px";
    panel.style.top =
      Math.max(
        12,
        rect.bottom + bounds.height + 6 < innerHeight
          ? rect.bottom + 6
          : rect.top - bounds.height - 6,
      ) + "px";
    setOpen(true);
    (last ? buttons().at(-1) : buttons()[0])?.focus({ preventScroll: true });
  }
  return (
    <>
      <button
        ref={trigger}
        className="icon-button entity-menu-trigger"
        type="button"
        aria-label={`Actions for ${label}`}
        title={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() =>
          menu.current?.matches(":popover-open")
            ? menu.current.hidePopover()
            : show()
        }
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            show(e.key === "ArrowUp");
          }
        }}
      >
        <Icon name="more" size={20} />
      </button>
      <div
        id={id}
        ref={menu}
        popover="auto"
        role="menu"
        aria-label={`${label} actions`}
        className="entity-menu-popover"
        onToggle={() =>
          setOpen(menu.current?.matches(":popover-open") ?? false)
        }
        onKeyDown={(e) => {
          const options = buttons(),
            index = options.indexOf(
              document.activeElement as HTMLButtonElement,
            );
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? options.length - 1
                  : (index +
                      (e.key === "ArrowDown" ? 1 : -1) +
                      options.length) %
                    options.length;
            options[next]?.focus({ preventScroll: true });
          } else if (e.key === "Escape") {
            e.preventDefault();
            menu.current?.hidePopover();
            trigger.current?.focus();
          } else if (e.key === "Tab") {
            menu.current?.hidePopover();
            trigger.current?.focus();
          }
        }}
      >
        {items.map((item) => (
          <button
            type="button"
            role="menuitem"
            key={item.label}
            disabled={item.disabled}
            title={item.title}
            className={item.danger ? "is-danger" : ""}
            onClick={() => {
              menu.current?.hidePopover();
              trigger.current?.focus();
              item.onSelect();
            }}
          >
            {item.icon && <Icon name={item.icon} size={16} />}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
