import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Tamales Bar",
  description: "Gestão de comandas, caixa e balancete para bares",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
