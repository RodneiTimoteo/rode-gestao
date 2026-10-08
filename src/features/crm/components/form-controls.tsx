import type { ReactNode } from "react";

export const inputClassName = "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-strong outline-none transition placeholder:text-subtle focus:border-brand disabled:cursor-not-allowed disabled:opacity-60";
export const textareaClassName = "min-h-28 w-full resize-y rounded-xl border border-line bg-surface px-3 py-2.5 text-sm leading-6 text-strong outline-none transition placeholder:text-subtle focus:border-brand disabled:cursor-not-allowed disabled:opacity-60";

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-strong">{label}</label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : hint ? <p className="mt-1.5 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

export function FormMessage({ status, message }: { status: "idle" | "success" | "error"; message: string }) {
  if (!message) return null;
  return <p role={status === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${status === "error" ? "bg-danger-soft text-danger" : "bg-positive-soft text-positive"}`}>{message}</p>;
}
