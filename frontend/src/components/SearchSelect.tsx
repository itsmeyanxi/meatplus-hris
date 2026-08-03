"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SearchOption = { value: string; label?: string; hint?: string };

/**
 * A searchable dropdown that also behaves like a text input: focus it and type
 * to filter the options, or click and pick. A drop-in replacement for a plain
 * <select> — pass `value`, `onChange(value)`, and an `options` array. Keeps
 * string values (like a native select); numeric callers coerce on their side.
 *
 * The option panel is rendered in a portal with fixed positioning, so it always
 * floats above surrounding cards/tables and is never clipped by an ancestor's
 * overflow or stacking context (e.g. a card's backdrop-blur).
 */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className = "",
  disabled = false,
  id,
  name,
  "aria-label": ariaLabel,
}: {
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const reactId = useId();
  const listId = `${id ?? name ?? reactId}-listbox`;

  const val = value == null ? "" : String(value);
  const selected = options.find((o) => o.value === val);
  const selectedLabel = selected?.label ?? "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label?.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q));
  }, [options, query]);

  const updateRect = () => {
    const r = boxRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  // Reposition the portalled panel while open (on scroll/resize).
  useEffect(() => {
    if (!open) return;
    updateRect();
    const h = () => updateRect();
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("scroll", h, true);
      window.removeEventListener("resize", h);
    };
  }, [open]);

  // Close on outside click (accounting for the portalled panel).
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Keep the active option in view.
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const el = panelRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (opt: SearchOption) => {
    onChange(opt.value);
    setOpen(false);
    setQuery("");
  };

  const openList = () => {
    if (disabled) return;
    updateRect();
    setOpen(true);
    setActive(Math.max(0, filtered.findIndex((o) => o.value === val)));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      openList();
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[active]) pick(filtered[active]); }
    else if (e.key === "Escape") { setOpen(false); setQuery(""); }
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          id={id}
          name={name}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={open ? query : selectedLabel}
          placeholder={open ? (selectedLabel || placeholder) : placeholder}
          onFocus={openList}
          onChange={(e) => { setOpen(true); setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-left text-sm outline-none focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${!open && val === "" ? "text-slate-400" : "text-slate-800"}`}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          className="absolute inset-y-0 right-0 flex items-center px-2 text-slate-400"
          aria-label="Toggle options"
        >
          <svg className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {open && rect && typeof document !== "undefined" && createPortal(
        <ul
          ref={panelRef}
          id={listId}
          role="listbox"
          style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, zIndex: 9999 }}
          className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-400">No matches{query ? ` for “${query}”` : ""}.</li>
          ) : (
            filtered.map((o, i) => (
              <li key={o.value || `__${i}`} role="option" aria-selected={o.value === val}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left ${i === active ? "bg-slate-50" : ""} ${o.value === val ? "font-medium text-brand-700" : "text-slate-700"}`}
                >
                  <span className="truncate">{o.label || <span className="text-slate-400">{placeholder}</span>}</span>
                  {o.hint ? <span className="shrink-0 font-mono text-xs text-slate-400">{o.hint}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>,
        document.body,
      )}
    </div>
  );
}
