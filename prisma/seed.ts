import { AccountType, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const testPassword = process.env.SEED_DEFAULT_PASSWORD ?? "123456";
  const passwordHash = await bcrypt.hash(testPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@local" },
    update: {
      name: "Administrador",
      passwordHash,
      role: Role.ADMIN,
      active: true,
    },
    create: {
      name: "Administrador",
      email: "admin@local",
      passwordHash,
      role: Role.ADMIN,
      active: true,
    },
  });

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {
      allowAddItemsWhenBilling: true,
      defaultServiceFeePercent: 10,
      enableStockModule: true,
      enableCustomerFields: false,
      updatedById: admin.id,
    },
    create: {
      id: 1,
      allowAddItemsWhenBilling: true,
      defaultServiceFeePercent: 10,
      enableStockModule: true,
      enableCustomerFields: false,
      updatedById: admin.id,
    },
  });

  const categories = [
    { name: "Vendas", type: AccountType.REVENUE },
    { name: "Outras Receitas", type: AccountType.REVENUE },
    { name: "Fornecedores", type: AccountType.EXPENSE },
    { name: "Aluguel", type: AccountType.EXPENSE },
    { name: "Taxas", type: AccountType.EXPENSE },
    { name: "Salários", type: AccountType.EXPENSE },
    { name: "Utilidades", type: AccountType.EXPENSE },
    { name: "Gás", type: AccountType.EXPENSE },
    { name: "Gelo", type: AccountType.EXPENSE },
  ];

  for (const category of categories) {
    await prisma.accountCategory.upsert({
      where: {
        name_type: {
          name: category.name,
          type: category.type,
        },
      },
      update: {},
      create: category,
    });
  }

  const baseUsers: Array<{ name: string; email: string; role: Role }> = [
    { name: "Gerente", email: "manager@local", role: Role.MANAGER },
    { name: "Caixa", email: "cashier@local", role: Role.CASHIER },
    { name: "Garçom", email: "waiter@local", role: Role.WAITER },
    { name: "Estoque", email: "stock@local", role: Role.STOCK },
  ];

  for (const user of baseUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash,
        role: user.role,
        active: true,
      },
      create: {
        ...user,
        passwordHash,
        active: true,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
