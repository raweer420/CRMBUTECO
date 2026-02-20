export type PaymentMethod =
  | "PIX"
  | "CREDIT"
  | "DEBIT"
  | "CASH"
  | "VOUCHER"
  | "FIADO";

export type PaymentInput = {
  method: PaymentMethod;
  amount: number;
};

export type RevenueLedgerEntryInput = {
  categoryId: string;
  tabId: string;
  createdById: string;
  date: Date;
  descriptionPrefix?: string;
};

export type RevenueLedgerEntry = {
  categoryId: string;
  relatedTabId: string;
  createdById: string;
  date: Date;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
};

export function aggregatePaymentsByMethod(payments: PaymentInput[]) {
  const map = new Map<PaymentMethod, number>();

  for (const payment of payments) {
    map.set(payment.method, (map.get(payment.method) ?? 0) + payment.amount);
  }

  return Array.from(map.entries()).map(([method, amount]) => ({
    method,
    amount: Math.round((amount + Number.EPSILON) * 100) / 100,
  }));
}

export function buildRevenueLedgerEntries(
  payments: PaymentInput[],
  metadata: RevenueLedgerEntryInput,
): RevenueLedgerEntry[] {
  const grouped = aggregatePaymentsByMethod(payments);
  const prefix = metadata.descriptionPrefix ?? "Receita de comanda";

  return grouped.map((entry) => ({
    categoryId: metadata.categoryId,
    relatedTabId: metadata.tabId,
    createdById: metadata.createdById,
    date: metadata.date,
    description: `${prefix} (${entry.method})`,
    amount: entry.amount,
    paymentMethod: entry.method,
  }));
}

