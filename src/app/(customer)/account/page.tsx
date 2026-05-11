import Link from "next/link";
import { InfoTile } from "@/components/shared/info-tile";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { logoutAction } from "@/domains/auth/actions";
import { getCurrentUser } from "@/domains/auth/session";
import { getCustomerAccountOverview } from "@/domains/users/queries";

export const dynamic = "force-dynamic";

function LoginPrompt() {
  return (
    <SurfaceShell
      title="Профиль клиента"
      description="Войдите по номеру телефона, чтобы сохранять адреса и видеть историю заказов."
    >
      <Link
        href="/login"
        className="inline-flex rounded-md bg-accent px-4 py-3 text-sm font-medium text-accent-foreground"
      >
        Войти по телефону
      </Link>
    </SurfaceShell>
  );
}

export default async function AccountPage() {
  const user = await getCurrentUser();

  if (!user) {
    return <LoginPrompt />;
  }

  const account = await getCustomerAccountOverview(user.id);

  if (!account) {
    return <LoginPrompt />;
  }

  const roles = account.roles.map((role) => role.role).join(", ");

  return (
    <SurfaceShell
      title="Профиль клиента"
      description="Аккаунт клиента, сохраненные адреса и история заказов."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <InfoTile label="Телефон" value={account.phone} tone="accent" />
        <InfoTile label="Адреса" value={String(account._count.addresses)} />
        <InfoTile label="Заказы" value={String(account._count.orders)} />
        <InfoTile label="Язык" value={account.preferences?.language ?? "ru"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Сохраненные адреса</h2>
              <p className="mt-1 text-sm text-foreground/60">
                Адреса используются в checkout и сохраняются snapshot в заказе.
              </p>
            </div>
            <Link
              href="/account/addresses"
              className="rounded-md bg-accent px-4 py-3 text-center text-sm font-medium text-accent-foreground"
            >
              Управлять
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {account.addresses.length > 0 ? (
              account.addresses.map((address) => (
                <div
                  key={address.id}
                  className="rounded-md border border-border bg-background p-4"
                >
                  <div className="font-medium">
                    {address.label ?? "Адрес доставки"}
                  </div>
                  <div className="mt-1 text-sm text-foreground/65">
                    {address.addressLine}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-foreground/60">
                Адресов пока нет.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="text-sm text-foreground/60">Роли</div>
          <div className="mt-2 font-medium">{roles || "customer"}</div>
          <form action={logoutAction} className="mt-5">
            <button className="rounded-md border border-border px-4 py-3 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent">
              Выйти
            </button>
          </form>
        </div>
      </div>
    </SurfaceShell>
  );
}
