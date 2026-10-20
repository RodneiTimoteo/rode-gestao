export function formatCurrency(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount)
    : "—";
}

export function formatProposalDate(value: string | null | undefined, withTime = false) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date);
}

export function formatFileSize(value: number | string) {
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

