"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ConfirmOpts = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

/**
 * Promise-based confirm dialog — a styled drop-in for window.confirm().
 *
 *   const { confirm, dialog } = useConfirm();
 *   ...
 *   onClick={async () => { if (await confirm({ title: "Delete?" })) doIt(); }}
 *   ...
 *   return (<>{dialog}{rest}</>);
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | undefined>(undefined);

  const confirm = useCallback((o: ConfirmOpts) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = undefined;
    setOpts(null);
  }, []);

  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const open = opts !== null;

  // While open: lock body scroll, focus the confirm button, and close on Escape.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const dialog = opts ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={() => close(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={opts.title}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">{opts.title}</h3>
        {opts.message && <p className="mt-1.5 text-sm text-slate-500">{opts.message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {opts.cancelLabel ?? "Cancel"}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => close(true)}
            className={`rounded-xl px-3.5 py-2 text-sm font-medium text-white transition ${
              opts.danger ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-800"
            }`}
          >
            {opts.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
