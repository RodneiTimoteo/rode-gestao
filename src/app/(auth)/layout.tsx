import { Brand } from "@/components/layout/brand";
import { ThemeSelector } from "@/components/theme/theme-selector";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-canvas [background-image:var(--canvas-pattern)] lg:grid-cols-[minmax(380px,0.88fr)_1.12fr]">
      <section className="relative hidden overflow-hidden bg-[#121210] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_18%_12%,rgb(215_174_88/0.24),transparent_32%),radial-gradient(circle_at_82%_82%,rgb(215_174_88/0.10),transparent_34%),linear-gradient(rgb(255_255_255/0.025)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.025)_1px,transparent_1px)] [background-size:auto,auto,48px_48px,48px_48px]" />
        <div className="relative [&_p:first-of-type]:text-[#f4f0e6] [&_p:last-child]:text-[#d7ae58]"><Brand /></div>
        <div className="relative max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d7ae58]">Gestão integrada</p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.045em]">Clareza para conduzir cada etapa do seu negócio.</h1>
          <p className="mt-5 text-sm leading-7 text-white/65">Um ambiente privado para acompanhar clientes, projetos, finanças e compromissos da RODE.</p>
        </div>
        <p className="relative text-xs text-white/45">© 2026 RODE — Soluções Inteligentes</p>
      </section>
      <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="absolute right-5 top-5 sm:right-8 sm:top-8"><ThemeSelector /></div>
        <div className="w-full max-w-[430px] rounded-3xl border border-line bg-surface/80 p-6 shadow-[var(--shadow-md)] backdrop-blur-xl sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <div className="mb-10 lg:hidden"><Brand /></div>
          {children}
        </div>
      </section>
    </main>
  );
}
