import type { ProposalFormItem } from "@/features/proposals/types";

export function roundProposalNumber(value: number, decimalPlaces: number) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimalPlaces;
  const rounded = Math.round((value + Number.EPSILON * Math.max(1, Math.abs(value))) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeProposalItem(item: ProposalFormItem): ProposalFormItem {
  return {
    ...item,
    quantity: roundProposalNumber(Number(item.quantity), 3),
    unit_price: roundProposalNumber(Number(item.unit_price), 2),
    discount_amount: roundProposalNumber(Number(item.discount_amount), 2),
  };
}

export function calculateProposalLineTotal(item: ProposalFormItem) {
  const normalized = normalizeProposalItem(item);
  return roundProposalNumber(
    normalized.quantity * normalized.unit_price - normalized.discount_amount,
    2,
  );
}

export function calculateProposalPreview(items: ProposalFormItem[]) {
  const normalized = items.map(normalizeProposalItem);
  const subtotal = roundProposalNumber(
    normalized.reduce((sum, item) => sum + item.quantity * item.unit_price, 0),
    2,
  );
  const discount = roundProposalNumber(
    normalized.reduce((sum, item) => sum + item.discount_amount, 0),
    2,
  );

  return {
    subtotal,
    discount,
    total: roundProposalNumber(subtotal - discount, 2),
  };
}
