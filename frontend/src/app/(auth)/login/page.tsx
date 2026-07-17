"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { login, getMe, switchCompany, type Me } from "@/lib/auth";

const schema = z.object({
  email: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

// The backend runs on a free host that sleeps after ~15 min idle. A request to a
// sleeping server takes ~20-30s to wake it ("cold start"). We ping /up on page
// load so the wake happens while the user is still typing, and we hold login
// until it's awake — the user sees "starting…" instead of a confusing error.
type ServerState = "checking" | "starting" | "ready";

// Direct backend health URL, used only to *nudge* a sleeping host awake. We read
// readiness from the same-origin /up (below); this fire-and-forget hit reaches the
// host directly and reliably triggers the wake even if the proxy returns a fast
// 502. Set NEXT_PUBLIC_WARMUP_URL when self-hosting; on any other host this simply
// fails silently and the /up polling still handles the wake.
const NUDGE_URL =
  process.env.NEXT_PUBLIC_WARMUP_URL ?? "https://meatplus-hris-api.onrender.com/up";

function nudgeAwake(): void {
  // no-cors: the browser sends the request (waking the host) even though we can't
  // read the opaque response. Purely a side effect; we never await it.
  void fetch(NUDGE_URL, { mode: "no-cors", cache: "no-store" }).catch(() => {});
}

/** One health probe. Resolves true only if the backend answered OK. */
async function pingBackend(timeoutMs = 30_000): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/up", { cache: "no-store", signal: ctrl.signal });
    return res.ok;
  } catch {
    return false; // 502 from a sleeping server, or a network hiccup
  } finally {
    clearTimeout(t);
  }
}

/** Keep pinging until the backend answers or we give up, nudging the host awake. */
async function waitForBackend(maxSeconds = 75): Promise<boolean> {
  const deadline = Date.now() + maxSeconds * 1000;
  nudgeAwake();
  while (Date.now() < deadline) {
    if (await pingBackend()) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [server, setServer] = useState<ServerState>("checking");
  // After sign-in, users who belong to more than one company pick which to enter.
  const [companies, setCompanies] = useState<Me["user"]["companies"]>([]);
  const [entering, setEntering] = useState<number | null>(null);
  const warming = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // Wake the server as soon as the page opens.
  const warm = useCallback(async () => {
    if (warming.current) return;
    warming.current = true;
    // Quick check first — if it's already awake, no banner at all.
    if (await pingBackend(6000)) {
      setServer("ready");
      warming.current = false;
      return;
    }
    setServer("starting");
    const ok = await waitForBackend();
    setServer(ok ? "ready" : "starting"); // if it never woke, keep showing the notice
    warming.current = false;
  }, []);

  useEffect(() => {
    // warm() only setStates after awaits (never synchronously), so this is safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    warm();
  }, [warm]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    // If the server isn't confirmed awake yet, wake it before trying to log in
    // so the attempt doesn't fail on a cold start.
    if (server !== "ready") {
      setServer("starting");
      await waitForBackend();
      setServer("ready");
    }
    try {
      await login(values.email, values.password);
      // If the account belongs to several companies, let them choose one to enter.
      const me = await getMe();
      const list = me.user.companies ?? [];
      if (list.length > 1) {
        setCompanies(list);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Login failed. Check your credentials.";
      setServerError(msg);
    }
  };

  const enterCompany = async (companyId: number) => {
    setServerError(null);
    setEntering(companyId);
    try {
      await switchCompany(companyId);
      router.push("/dashboard");
      router.refresh();
    } catch {
      setServerError("Could not enter that company. Please try again.");
      setEntering(null);
    }
  };

  const starting = server === "starting";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold">ALL COMPANY HRIS</h1>
        <p className="mb-6 text-sm text-slate-500">
          {companies.length > 1 ? "Choose a company to enter." : "Sign in to continue."}
        </p>

        {companies.length > 1 ? (
          <div className="space-y-2">
            {companies.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => enterCompany(c.id)}
                disabled={entering !== null}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
              >
                <span>
                  <span className="block text-sm font-medium text-slate-900">{c.legal_name}</span>
                  <span className="block text-xs text-slate-400">{c.code}</span>
                </span>
                <span className="text-xs font-medium text-slate-500">
                  {entering === c.id ? "Entering…" : "Enter →"}
                </span>
              </button>
            ))}
            {serverError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
            )}
          </div>
        ) : (
        <>
        {starting && (
          <div className="mb-4 flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            <span>
              Starting the server… the first sign-in after a quiet period can take up to 30
              seconds. You can fill in your details while you wait.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email or username
            </label>
            <input
              id="email"
              type="text"
              autoComplete="username"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              {...register("email")}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              {...register("password")}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">
                {errors.password.message}
              </p>
            )}
          </div>

          {serverError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {isSubmitting
              ? starting
                ? "Starting server…"
                : "Signing in…"
              : "Sign in"}
          </button>

          <div className="text-center">
            <Link
              href="/forgot-password"
              className="text-xs text-slate-500 hover:text-slate-800 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </form>
        </>
        )}
      </div>
    </div>
  );
}
