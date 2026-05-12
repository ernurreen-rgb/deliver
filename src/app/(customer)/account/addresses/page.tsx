import Link from "next/link";
import { AddressPicker } from "@/components/geo/address-picker";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { getCurrentUser } from "@/domains/auth/session";
import { getTwoGisMapKey } from "@/domains/geo";
import {
  createAddressAction,
  deleteAddressAction,
} from "@/domains/users/addresses";
import { getCustomerAddresses } from "@/domains/users/queries";

export const dynamic = "force-dynamic";

type AddressesPageProps = {
  searchParams: Promise<{
    saved?: string;
    deleted?: string;
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  address_required:
    "Выберите адрес из подсказок или точку на карте в пределах Алматы.",
  geocode_failed: "Не удалось определить адрес. Проверьте город и адрес.",
  input_too_long: "Проверьте длину полей адреса.",
};

export default async function AddressesPage({
  searchParams,
}: AddressesPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const errorMessage = params.error ? errorMessages[params.error] : null;

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

  const addresses = await getCustomerAddresses(user.id);
  const mapApiKey = getTwoGisMapKey();

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

      {errorMessage ? (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">Список адресов</h2>
          <div className="mt-5 grid gap-3">
            {addresses.length > 0 ? (
              addresses.map((address) => (
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
                maxLength={80}
                placeholder="Дом, работа"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
            </label>
            <AddressPicker mapApiKey={mapApiKey} />
            <div className="grid grid-cols-2 gap-3">
              <input
                name="street"
                maxLength={160}
                placeholder="Улица"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
              <input
                name="house"
                maxLength={32}
                placeholder="Дом"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
              <input
                name="apartment"
                maxLength={32}
                placeholder="Квартира"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
              <input
                name="entrance"
                maxLength={32}
                placeholder="Подъезд"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
              <input
                name="floor"
                maxLength={32}
                placeholder="Этаж"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
              <input
                name="intercom"
                maxLength={32}
                placeholder="Домофон"
                className="h-11 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
              />
            </div>
            <textarea
              name="comment"
              maxLength={500}
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
