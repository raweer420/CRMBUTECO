import { describe, expect, it } from "vitest";

import {
  canAddItemsToTab,
  canRegisterPayment,
  canTransitionTabStatus,
} from "@/lib/domain/tabs";

describe("regras de status da comanda", () => {
  it("permite adicionar itens em OPEN", () => {
    expect(canAddItemsToTab("OPEN", false)).toBe(true);
  });

  it("respeita configuração para adicionar itens em BILLING", () => {
    expect(canAddItemsToTab("BILLING", true)).toBe(true);
    expect(canAddItemsToTab("BILLING", false)).toBe(false);
  });

  it("bloqueia itens e pagamento em PAID", () => {
    expect(canAddItemsToTab("PAID", true)).toBe(false);
    expect(canRegisterPayment("PAID")).toBe(false);
  });

  it("valida transições padrão OPEN/BILLING/PAID", () => {
    expect(canTransitionTabStatus("OPEN", "BILLING")).toBe(true);
    expect(canTransitionTabStatus("BILLING", "PAID")).toBe(true);
    expect(canTransitionTabStatus("PAID", "OPEN")).toBe(false);
  });
});

