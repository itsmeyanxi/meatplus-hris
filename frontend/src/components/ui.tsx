import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type CardProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function AppCard({ title, description, children, className = "" }: CardProps) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur ${className}`}
    >
      {(title || description) && (
        <div className="mb-4">
          {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {/* Maintained semantic screen reader hierarchy on list pages */}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

type AppInputProps = InputHTMLAttributes<HTMLInputElement>;

export function AppInput({ className = "", ...props }: AppInputProps) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 
        /* Accessibility Focus States */
        outline-none focus:border-slate-400 
        focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2
        ${className}`}
    />
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function AppButton({ variant = "primary", className = "", ...props }: ButtonProps) {
  const variantClass =
    variant === "primary"
      ? "border border-brand-600 bg-brand-600 text-white hover:bg-brand-700"
      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <button
      {...props}
      className={`rounded-xl px-3.5 py-2.5 text-sm font-medium shadow-sm transition
        /* Minimum mobile touch-target alignment & focus handling */
        disabled:cursor-not-allowed disabled:opacity-50
        outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2
        ${variantClass} ${className}`}
    />
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur">
      {children}
    </div>
  );
}

export function StatusBadge({ active, children }: { active?: boolean; children: ReactNode }) {
  return (
    <span
      className={
        active === undefined
          ? "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
          : active
            ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
            : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
      }
    >
      {children}
    </span>
  );
}