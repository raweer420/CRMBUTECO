import { describe, expect, it } from "vitest";

import { buildRevenueLedgerEntries } from "@/lib/domain/ledger";

describe("geração de lançamentos por método", () => {
  it("agrega pagamentos por método para gerar receitas", () => {
    const entries = buildRevenueLedgerEntries(
      [
        { method: "PIX", amount: 10 },
        { method: "PIX", amount: 5.5 },
        { method: "CASH", amount: 20 },
      ],
      {
        categoryId: "cat-vendas",
        tabId: "tab-1",
        createdById: "user-1",
        date: new Date("2026-02-20T12:00:00.000Z"),
      },
    );

    expect(entries).toHaveLength(2);

    const pix = entries.find((entry) => entry.paymentMethod === "PIX");
    const cash = entries.find((entry) => entry.paymentMethod === "CASH");

    expect(pix?.amount).toBe(15.5);
    expect(cash?.amount).toBe(20);
    expect(entries.every((entry) => entry.relatedTabId === "tab-1")).toBe(true);
  });
});

