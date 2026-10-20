export function formatProjectDate(value: string | null, withTime = false) {
  if (!value) return "—";
  const date = new Date(withTime ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", withTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" }).format(date);
}

export function formatProjectCurrency(value: number | string | null) {
  if (value === null || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount);
}

export function projectDeadlineState(date: string | null, status: string) {
  if (!date || status === "completed" || status === "cancelled") return null;
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (date < localToday) return "overdue" as const;
  const deadline = new Date(`${date}T12:00:00`);
  const current = new Date(`${localToday}T12:00:00`);
  const days = Math.ceil((deadline.getTime() - current.getTime()) / 86_400_000);
  return days <= 7 ? "near" as const : "ok" as const;
}
