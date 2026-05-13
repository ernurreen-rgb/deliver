import Link from "next/link";
import { InfoTile } from "@/components/shared/info-tile";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { logoutAction } from "@/domains/auth/actions";
import { getCurrentUser } from "@/domains/auth/session";
import { updateCustomerProfileAction } from "@/domains/users/profile";
import { getCustomerAccountOverview } from "@/domains/users/queries";

export const dynamic = "force-dynamic";

type AccountPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  input_too_long: "Текст слишком длинный.",
  invalid_language: "Выберите русский или казахский язык.",
  name_required: "Укажите имя для заказов.",
};

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

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();

  if (!user) {
    return <LoginPrompt />;
  }

  const account = await getCustomerAccountOverview(user.id);

  if (!account) {
    return <LoginPrompt />;
  }

  const roles = account.roles.map((role) => role.role).join(", ");
  const selectedLanguage = account.preferences?.language ?? "ru";
  const errorMessage = params.error ? errorMessages[params.error] : null;
  const profileSaved = params.saved === "profile";

  return (
    <SurfaceShell
      title="Профиль клиента"
      description="Аккаунт клиента, сохраненные адреса и история заказов."
    >
      <div className="grid gap-4 md:grid-cols-5">
        <InfoTile label="Имя" value={account.name ?? "Не указано"} />
        <InfoTile label="Телефон" value={account.phone} tone="accent" />
        <InfoTile label="Адреса" value={String(account._count.addresses)} />
        <InfoTile label="Заказы" value={String(account._count.orders)} />
        <InfoTile label="Язык" value={selectedLanguage} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
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
          <h2 className="font-semibold">Личные данные</h2>

          {profileSaved ? (
            <div className="mt-4 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
              Профиль сохранен.
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              {errorMessage}
            </div>
          ) : null}

          <form action={updateCustomerProfileAction} className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Имя</span>
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={account.name ?? ""}
                placeholder="Например, Ернур"
                className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-accent"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium">Язык</span>
              <select
                name="language"
                defaultValue={selectedLanguage}
                className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-accent"
              >
                <option value="ru">Русский</option>
                <option value="kk">Қазақша</option>
              </select>
            </label>

            <button className="h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground">
              Сохранить
            </button>
          </form>

          <div className="mt-5 border-t border-border pt-5">
            <div className="text-sm text-foreground/60">Роли</div>
            <div className="mt-2 font-medium">{roles || "customer"}</div>
            <form action={logoutAction} className="mt-5">
              <button className="rounded-md border border-border px-4 py-3 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent">
                Выйти
              </button>
            </form>
          </div>
        </div>
      </div>
    </SurfaceShell>
  );
}
