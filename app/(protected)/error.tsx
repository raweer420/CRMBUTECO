"use client";

import Link from "next/link";

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
      <h2 className="text-base font-semibold text-rose-800">Falha na operação</h2>
      <p className="mt-1 text-sm text-rose-700">{error.message}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-rose-700 px-3 py-2 text-sm font-medium text-white"
        >
          Tentar novamente
        </button>
        <Link
          href="/"
          className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700"
        >
          Voltar ao dashboard
        </Link>
      </div>
    </div>
  );
}
