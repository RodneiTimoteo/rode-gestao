"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Brand } from "@/components/layout/brand";
import { Icon } from "@/components/ui/icon";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { allNavigation, primaryNavigation, secondaryNavigation } from "@/config/navigation";
import type { NavigationItem } from "@/types/navigation";

type UserProfile = { displayName: string; email: string };

function getInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function NavLink({ item, compact, onNavigate }: { item: NavigationItem; compact: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={compact ? item.label : undefined} className={`group relative flex h-11 items-center rounded-xl text-sm font-medium transition-colors ${compact ? "justify-center px-2" : "gap-3 px-3"} ${active ? "bg-brand-soft text-brand" : "text-muted hover:bg-soft hover:text-strong"}`}>{active && <span className="absolute -left-3 h-5 w-1 rounded-r-full bg-brand" />}<Icon name={item.icon} className="size-[19px] shrink-0" />{!compact && <span className="truncate">{item.label}</span>}</Link>;
}

function SidebarContent({ compact, user, onNavigate }: { compact: boolean; user: UserProfile; onNavigate?: () => void }) {
  return <><div className={`flex h-[73px] items-center border-b border-line ${compact ? "justify-center px-2" : "px-5"}`}><Brand compact={compact} /></div><nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-1 px-3 py-5">{primaryNavigation.map((item) => <NavLink key={item.href} item={item} compact={compact} onNavigate={onNavigate} />)}</nav><div className="border-t border-line p-3">{secondaryNavigation.map((item) => <NavLink key={item.href} item={item} compact={compact} onNavigate={onNavigate} />)}{!compact && <div className="mt-3 flex items-center gap-3 rounded-xl bg-soft p-3"><div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{getInitials(user.displayName)}</div><div className="min-w-0"><p className="truncate text-xs font-semibold text-strong">{user.displayName}</p><p className="mt-0.5 truncate text-[11px] text-subtle">{user.email}</p></div></div>}<LogoutButton compact={compact} /></div></>;
}

export function AdminShell({ children, user }: { children: React.ReactNode; user: UserProfile }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentPage = allNavigation.find((item) => pathname === item.href)?.label ?? "RODE Gestão";

  return <div className="min-h-screen bg-canvas">
    <a href="#conteudo-principal" className="fixed left-3 top-3 z-[70] -translate-y-20 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white focus:translate-y-0">Pular para o conteúdo</a>
    <aside className={`fixed inset-y-0 left-0 z-40 hidden border-r border-line bg-surface transition-[width] duration-200 lg:flex lg:flex-col ${collapsed ? "w-[76px]" : "w-[244px]"}`}><SidebarContent compact={collapsed} user={user} /><button type="button" onClick={() => setCollapsed((value) => !value)} className="absolute -right-3 top-[88px] grid size-7 place-items-center rounded-full border border-line bg-surface text-muted shadow-sm hover:text-brand" aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}><Icon name="panel" className={`size-3.5 ${collapsed ? "rotate-180" : ""}`} /></button></aside>
    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><button type="button" className="absolute inset-0 bg-[#09110d]/55 backdrop-blur-[2px]" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} /><aside className="relative flex h-full w-[min(86vw,310px)] flex-col bg-surface shadow-2xl"><button type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-5 grid size-9 place-items-center rounded-lg text-muted hover:bg-soft" aria-label="Fechar menu lateral"><Icon name="close" className="size-5" /></button><SidebarContent compact={false} user={user} onNavigate={() => setMobileOpen(false)} /></aside></div>}
    <div className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-[76px]" : "lg:pl-[244px]"}`}>
      <header className="sticky top-0 z-30 flex h-[73px] items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur-md sm:px-6 lg:px-8"><div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setMobileOpen(true)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-line text-muted lg:hidden" aria-label="Abrir menu lateral"><Icon name="menu" className="size-5" /></button><div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-[0.13em] text-subtle">Visão geral</p><p className="truncate text-sm font-semibold text-strong">{currentPage}</p></div></div><div className="flex items-center gap-2 sm:gap-3"><div className="hidden h-10 w-56 items-center gap-2.5 rounded-xl border border-line bg-soft px-3 text-sm text-subtle md:flex"><Icon name="search" className="size-4" /><span>Buscar no sistema</span><kbd className="ml-auto rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-subtle">⌘ K</kbd></div><ThemeSelector /><button type="button" className="relative grid size-10 place-items-center rounded-xl border border-line bg-surface text-muted hover:bg-soft" aria-label="Notificações"><Icon name="bell" className="size-[18px]" /><span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-warning ring-2 ring-surface" /></button><div className="hidden size-10 place-items-center rounded-full bg-brand text-xs font-semibold text-white sm:grid" aria-label={`Perfil de ${user.displayName}`}>{getInitials(user.displayName)}</div></div></header>
      <main id="conteudo-principal" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  </div>;
}
