// Shared form field styles. Use these instead of re-declaring the same
// Tailwind string in every form. (The compact `rounded-md` variant lives in
// components/employees/ChildList for its own use.)

export const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900/50";

export const labelCls = "mb-1.5 block text-sm font-medium text-slate-700";
