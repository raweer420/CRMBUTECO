import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Acesso negado</h1>
        <p className="mt-2 text-sm text-slate-600">
          Seu perfil não possui permissão para esta área.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Voltar para dashboard
        </Link>
      </div>
    </div>
  );
}

