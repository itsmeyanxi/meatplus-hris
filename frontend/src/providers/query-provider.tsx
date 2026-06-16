"use client";

import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { useState, type ReactNode } from "react";

/** Pull a human message out of an axios-style error. */
function errorMessage(e: unknown): string {
  const ax = e as {
    response?: { data?: { message?: string; errors?: Record<string, string[]> } };
  };
  const fieldErrors = ax?.response?.data?.errors;
  if (fieldErrors) {
    const first = Object.values(fieldErrors).flat()[0];
    if (first) return first;
  }
  return ax?.response?.data?.message ?? (e instanceof Error ? e.message : "Something went wrong.");
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
        // App-wide feedback for ALL mutations: errors always toast; successes
        // toast only when a mutation opts in via `meta.successMessage`.
        mutationCache: new MutationCache({
          onError: (error) => toast.error(errorMessage(error)),
          onSuccess: (_data, _vars, _ctx, mutation) => {
            const msg = mutation.options.meta?.successMessage;
            if (msg) toast.success(String(msg));
          },
        }),
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster richColors closeButton position="top-right" />
    </QueryClientProvider>
  );
}
