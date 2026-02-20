export type DomainTabStatus = "OPEN" | "BILLING" | "PAID" | "CANCELED";

export type TabTotalInputItem = {
  quantity: number;
  unitPrice: number;
  canceled?: boolean;
};

export type TabTotals = {
  subtotal: number;
  discount: number;
  serviceFee: number;
  total: number;
};

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateTabTotals(
  items: TabTotalInputItem[],
  discount: number,
  serviceFeePercent: number,
): TabTotals {
  const subtotal = roundCurrency(
    items
      .filter((item) => !item.canceled)
      .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  );

  const boundedDiscount = Math.max(0, Math.min(discount, subtotal));
  const baseAfterDiscount = subtotal - boundedDiscount;
  const serviceFee = roundCurrency(baseAfterDiscount * (serviceFeePercent / 100));
  const total = roundCurrency(baseAfterDiscount + serviceFee);

  return {
    subtotal,
    discount: roundCurrency(boundedDiscount),
    serviceFee,
    total,
  };
}

export function canAddItemsToTab(
  status: DomainTabStatus,
  allowAddItemsWhenBilling: boolean,
  adminOverride = false,
) {
  if (adminOverride) {
    return status !== "CANCELED";
  }

  if (status === "OPEN") {
    return true;
  }

  if (status === "BILLING") {
    return allowAddItemsWhenBilling;
  }

  return false;
}

export function canRegisterPayment(status: DomainTabStatus, adminOverride = false) {
  if (adminOverride) {
    return status !== "CANCELED";
  }

  return status === "OPEN" || status === "BILLING";
}

export function canMutateTab(status: DomainTabStatus, adminOverride = false) {
  if (adminOverride) {
    return status !== "CANCELED";
  }

  return status === "OPEN" || status === "BILLING";
}

export function canTransitionTabStatus(
  currentStatus: DomainTabStatus,
  nextStatus: DomainTabStatus,
  adminOverride = false,
) {
  if (currentStatus === nextStatus) {
    return true;
  }

  if (adminOverride) {
    return nextStatus !== "CANCELED" || currentStatus !== "PAID";
  }

  if (currentStatus === "OPEN") {
    return nextStatus === "BILLING" || nextStatus === "CANCELED";
  }

  if (currentStatus === "BILLING") {
    return nextStatus === "PAID" || nextStatus === "CANCELED" || nextStatus === "OPEN";
  }

  return false;
}
