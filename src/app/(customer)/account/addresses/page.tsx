import Link from "next/link";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { getCurrentUser } from "@/domains/auth/session";
import {
  createAddressAction,
  deleteAddressAction,
} from "@/domains/users/addresses";

export const dynamic = "force-dynamic";

type AddressesPageProps = {
  searchParams: Promise<{
    saved?: string;
    deleted?: string;
    error?: string;
  }>;
};

export default async function AddressesPage({
  searchParams,
}: AddressesPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    return (
      <SurfaceShell
        title="Адреса доставки"
        description="Войдите по номеру телефона, чтобы управлять адресами."
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

  return (
    <SurfaceShell
      title="Адреса доставки"
      description="Сохраненные адреса клиента. В заказе будет сохраняться snapshot выбранного адреса."
    >
      {params.saved ? (
        <div className="mb-5 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
          Адрес сохранен.
        </div>
      ) : null}

      {params.deleted ? (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          Адрес удален.
        </div>
      ) : null}

      {params.error === "address_required" ? (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          Заполните адресную строку.
        </div>
      ) : null}

      {params.error === "geocode_failed" ? (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          Не удалось определить адрес. Проверьте город и адрес.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">Список адресов</h2>
          <div className="mt-5 grid gap-3">
            {user.addresses.length > 0 ? (
              user.addresses.map((address) => (
                <div
                  key={address.id}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="font-semibold">
                        {address.label ?? "Адрес доставки"}
                      </div>
                      <div className="mt-1 text-sm text-foreground/65">
                        {address.city}, {address.addressLine}
                      </div>
                      <div className="mt-2 text-sm text-foreground/55">
                        {[
                          address.apartment && `кв. ${address.apartment}`,
                          address.entrance && `подъезд ${address.entrance}`,
                          address.floor && `этаж ${address.floor}`,
                        ]
                          .filter(Boolean)
                          .join(", ") || "Детали не указаны"}
                      </div>
                    </div>
                    <form action={deleteAddressAction}>
                      <input name="addressId" type="hidden" value={address.id} />
                      <button className="rounded-md border border-border px-3 py-2 text-sm text-foreground/70 transition-colors hover:border-warning hover:text-warning">
                        Удалить
                      </button>
                    </form>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border p-5 text-sm text-foreground/60">
                Адресов пока нет.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">Новый адрес</h2>
          <form action={createAddressAction} className="mt-5 grid gap-3">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Название</span>
              <input
                name="label"
                placeholder="Дом, работа"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Город</span>
              <input
                name="city"
                defaultValue="Алматы"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Адрес</span>
              <input
                name="addressLine"
                placeholder="проспект Абая, 10"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                name="street"
                placeholder="Улица"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
              <input
                name="house"
                placeholder="Дом"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
              <input
                name="apartment"
                placeholder="Квартира"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
              <input
                name="entrance"
                placeholder="Подъезд"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
              <input
                name="floor"
                placeholder="Этаж"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
              <input
                name="intercom"
                placeholder="Домофон"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
            </div>
            <textarea
              name="comment"
              placeholder="Комментарий к адресу"
              className="min-h-24 rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-accent"
            />
            <button className="h-12 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground">
              Сохранить адрес
            </button>
          </form>
        </section>
      </div>
    </SurfaceShell>
  );
}
