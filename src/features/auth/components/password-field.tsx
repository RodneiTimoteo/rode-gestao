"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";

export function PasswordField({ id = "password", label = "Senha", autoComplete = "current-password", minLength }: { id?: string; label?: string; autoComplete?: string; minLength?: number }) {
  const [visible, setVisible] = useState(false);
  return <div><label htmlFor={id} className="mb-2 block text-sm font-medium text-strong">{label}</label><div className="relative"><Icon name="lock" className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-subtle" /><input id={id} name={id} type={visible ? "text" : "password"} autoComplete={autoComplete} minLength={minLength} required className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-11 text-sm text-strong outline-none transition placeholder:text-subtle focus:border-brand focus:ring-4 focus:ring-brand-soft" placeholder="••••••••" /><button type="button" onClick={() => setVisible((value) => !value)} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-soft" aria-label={visible ? "Ocultar senha" : "Mostrar senha"}><Icon name={visible ? "eyeOff" : "eye"} className="size-[17px]" /></button></div></div>;
}
