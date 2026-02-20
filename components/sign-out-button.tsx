import { clearAccessProfileAction } from "@/app/actions/access-actions";

export function SignOutButton() {
  return (
    <form action={clearAccessProfileAction}>
      <button
        type="submit"
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        Trocar perfil
      </button>
    </form>
  );
}
