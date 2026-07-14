"use client";

import { useState } from "react";

// Password policy: 8-20 chars with at least one lowercase, uppercase, number and
// special character. Mirrors the backend rule (StoreUserRequest) so the UI and
// server agree.
const RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: "8 to 20 characters", test: (v) => v.length >= 8 && v.length <= 20 },
  { label: "A lowercase letter", test: (v) => /[a-z]/.test(v) },
  { label: "A capital letter", test: (v) => /[A-Z]/.test(v) },
  { label: "A number", test: (v) => /[0-9]/.test(v) },
  { label: "A special character", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export function isPasswordValid(v: string): boolean {
  return RULES.every((r) => r.test(v));
}

export function PasswordField({
  value,
  onChange,
  label = "New Password",
  required = true,
  autoComplete = "new-password",
  id = "password",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  required?: boolean;
  autoComplete?: string;
  id?: string;
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const showChecklist = focused || value.length > 0;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {required && <span className="text-red-500">*</span>} {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          required={required}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-slate-400 hover:text-slate-700"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>

      {showChecklist && (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
          <div className="bg-slate-700 px-4 py-3 text-xs leading-relaxed text-white">
            The password length is 8&ndash;20 characters and must contain at least 1 lowercase letter,
            1 capital letter, 1 number, and 1 special character.
          </div>
          <ul className="divide-y divide-slate-100 bg-white">
            {RULES.map((r) => {
              const ok = r.test(value);
              return (
                <li key={r.label} className="flex items-center gap-2.5 px-4 py-2 text-sm">
                  {ok ? (
                    <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-slate-300" />
                  )}
                  <span className={ok ? "text-emerald-700" : "text-slate-500"}>{r.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
