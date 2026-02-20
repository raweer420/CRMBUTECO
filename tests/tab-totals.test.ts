import { describe, expect, it } from "vitest";

import { calculateTabTotals } from "@/lib/domain/tabs";

describe("calculateTabTotals", () => {
  it("calcula subtotal, desconto e taxa de serviço corretamente", () => {
    const totals = calculateTabTotals(
      [
        { quantity: 2, unitPrice: 15 },
        { quantity: 1, unitPrice: 20 },
      ],
      5,
      10,
    );

    expect(totals.subtotal).toBe(50);
    expect(totals.discount).toBe(5);
    expect(totals.serviceFee).toBe(4.5);
    expect(totals.total).toBe(49.5);
  });

  it("ignora itens cancelados e limita desconto ao subtotal", () => {
    const totals = calculateTabTotals(
      [
        { quantity: 1, unitPrice: 10, canceled: true },
        { quantity: 1, unitPrice: 8 },
      ],
      100,
      10,
    );

    expect(totals.subtotal).toBe(8);
    expect(totals.discount).toBe(8);
    expect(totals.serviceFee).toBe(0);
    expect(totals.total).toBe(0);
  });
});

