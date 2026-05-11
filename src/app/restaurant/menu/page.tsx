import Link from "next/link";
import { InfoTile } from "@/components/shared/info-tile";
import { SurfaceShell } from "@/components/layout/surface-shell";
import { getCurrentUser } from "@/domains/auth/session";
import {
  createMenuCategoryAction,
  createMenuItemAction,
  updateMenuCategoryAction,
  updateMenuItemAction,
} from "@/domains/menu/actions";
import { getRestaurantMenuManagement } from "@/domains/menu/queries";

export const dynamic = "force-dynamic";

type RestaurantMenuPageProps = {
  searchParams: Promise<{
    error?: string;
    updated?: string;
  }>;
};

type MenuDashboard = NonNullable<
  Awaited<ReturnType<typeof getRestaurantMenuManagement>>
>;
type MenuCategory = MenuDashboard["categories"][number];
type MenuItem = MenuCategory["items"][number];

const errorMessages: Record<string, string> = {
  category_name_required: "Укажите название категории.",
  category_not_found: "Категория не найдена.",
  category_required: "Выберите категорию.",
  input_too_long: "Текст слишком длинный.",
  invalid_price: "Укажите корректную цену.",
  item_name_required: "Укажите название блюда.",
  item_not_found: "Блюдо не найдено.",
  item_required: "Не передано блюдо.",
  restaurant_staff_required: "Аккаунт не привязан к ресторану.",
};

const updatedMessages: Record<string, string> = {
  category_created: "Категория создана.",
  category_updated: "Категория обновлена.",
  item_created: "Блюдо создано.",
  item_updated: "Блюдо обновлено.",
};

function FieldLabel({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-foreground/60">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  defaultValue,
  maxLength = 120,
  name,
  placeholder,
  required,
}: {
  defaultValue?: string | number;
  maxLength?: number;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <input
      name={name}
      defaultValue={defaultValue}
      maxLength={maxLength}
      placeholder={placeholder}
      required={required}
      className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
    />
  );
}

function NumberInput({
  defaultValue,
  max = 10000,
  min = 0,
  name,
}: {
  defaultValue?: number;
  max?: number;
  min?: number;
  name: string;
}) {
  return (
    <input
      name={name}
      type="number"
      min={min}
      max={max}
      defaultValue={defaultValue}
      className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
    />
  );
}

function TextArea({
  defaultValue,
  name,
  placeholder,
}: {
  defaultValue?: string;
  name: string;
  placeholder?: string;
}) {
  return (
    <textarea
      name={name}
      defaultValue={defaultValue}
      maxLength={500}
      placeholder={placeholder}
      rows={3}
      className="resize-none rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-accent"
    />
  );
}

function StatusChip({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        active
          ? "bg-accent/10 text-accent"
          : "bg-warning/10 text-warning"
      }`}
    >
      {children}
    </span>
  );
}

function CategoryForm({ category }: { category: MenuCategory }) {
  return (
    <form
      action={updateMenuCategoryAction}
      className="grid gap-3 border-t border-border pt-4"
    >
      <input name="categoryId" type="hidden" value={category.id} />
      <div className="grid gap-3 md:grid-cols-2">
        <FieldLabel label="Название RU">
          <TextInput name="nameRu" defaultValue={category.nameRu} required />
        </FieldLabel>
        <FieldLabel label="Название KK">
          <TextInput name="nameKk" defaultValue={category.nameKk} />
        </FieldLabel>
      </div>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
        <FieldLabel label="Порядок">
          <NumberInput name="sortOrder" defaultValue={category.sortOrder} />
        </FieldLabel>
        <label className="flex h-10 items-center gap-2 text-sm text-foreground/75">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={category.isActive}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Показывать категорию
        </label>
        <button
          type="submit"
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Сохранить
        </button>
      </div>
    </form>
  );
}

function ItemForm({
  categories,
  item,
}: {
  categories: MenuCategory[];
  item: MenuItem;
}) {
  return (
    <form
      action={updateMenuItemAction}
      className="grid gap-4 rounded-lg border border-border bg-background p-4"
    >
      <input name="itemId" type="hidden" value={item.id} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-semibold">{item.displayName}</div>
        <div className="flex flex-wrap gap-2">
          <StatusChip active={item.isActive}>
            {item.isActive ? "В меню" : "Скрыто"}
          </StatusChip>
          <StatusChip active={item.isAvailable}>
            {item.isAvailable ? "В продаже" : "Стоп"}
          </StatusChip>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <FieldLabel label="Название RU">
          <TextInput name="nameRu" defaultValue={item.nameRu} required />
        </FieldLabel>
        <FieldLabel label="Название KK">
          <TextInput name="nameKk" defaultValue={item.nameKk} />
        </FieldLabel>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <FieldLabel label="Описание RU">
          <TextArea name="descriptionRu" defaultValue={item.descriptionRu} />
        </FieldLabel>
        <FieldLabel label="Описание KK">
          <TextArea name="descriptionKk" defaultValue={item.descriptionKk} />
        </FieldLabel>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_160px_120px]">
        <FieldLabel label="Категория">
          <select
            name="categoryId"
            defaultValue={item.categoryId}
            className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:border-accent"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.displayName}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="Цена, ₸">
          <NumberInput
            name="priceKzt"
            min={1}
            max={1_000_000}
            defaultValue={item.priceKzt}
          />
        </FieldLabel>
        <FieldLabel label="Порядок">
          <NumberInput name="sortOrder" defaultValue={item.sortOrder} />
        </FieldLabel>
      </div>

      <FieldLabel label="Фото URL">
        <TextInput name="imageUrl" defaultValue={item.imageUrl} maxLength={500} />
      </FieldLabel>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground/75">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked={item.isActive}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Показывать
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground/75">
            <input
              name="isAvailable"
              type="checkbox"
              defaultChecked={item.isAvailable}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            В продаже
          </label>
        </div>
        <button
          type="submit"
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Сохранить блюдо
        </button>
      </div>
    </form>
  );
}

function CreateItemForm({ category }: { category: MenuCategory }) {
  return (
    <form
      action={createMenuItemAction}
      className="grid gap-3 rounded-lg border border-dashed border-border bg-surface p-4"
    >
      <input name="categoryId" type="hidden" value={category.id} />
      <div className="grid gap-3 md:grid-cols-2">
        <FieldLabel label="Название RU">
          <TextInput name="nameRu" required />
        </FieldLabel>
        <FieldLabel label="Название KK">
          <TextInput name="nameKk" />
        </FieldLabel>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <FieldLabel label="Описание RU">
          <TextArea name="descriptionRu" />
        </FieldLabel>
        <FieldLabel label="Описание KK">
          <TextArea name="descriptionKk" />
        </FieldLabel>
      </div>
      <div className="grid gap-3 md:grid-cols-[160px_120px_1fr_auto] md:items-end">
        <FieldLabel label="Цена, ₸">
          <NumberInput name="priceKzt" min={1} max={1_000_000} />
        </FieldLabel>
        <FieldLabel label="Порядок">
          <NumberInput name="sortOrder" />
        </FieldLabel>
        <FieldLabel label="Фото URL">
          <TextInput name="imageUrl" maxLength={500} />
        </FieldLabel>
        <button
          type="submit"
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Добавить
        </button>
      </div>
    </form>
  );
}

function CreateCategoryForm() {
  return (
    <form
      action={createMenuCategoryAction}
      className="grid gap-3 rounded-lg border border-border bg-surface p-5"
    >
      <h2 className="text-lg font-semibold">Новая категория</h2>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_140px_auto] md:items-end">
        <FieldLabel label="Название RU">
          <TextInput name="nameRu" required />
        </FieldLabel>
        <FieldLabel label="Название KK">
          <TextInput name="nameKk" />
        </FieldLabel>
        <FieldLabel label="Порядок">
          <NumberInput name="sortOrder" />
        </FieldLabel>
        <button
          type="submit"
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Создать
        </button>
      </div>
    </form>
  );
}

export default async function RestaurantMenuPage({
  searchParams,
}: RestaurantMenuPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    return (
      <SurfaceShell
        title="Меню ресторана"
        description="Войдите как сотрудник ресторана."
      >
        <Link
          href="/login"
          className="inline-flex rounded-md bg-accent px-4 py-3 text-sm font-medium text-accent-foreground"
        >
          Войти
        </Link>
      </SurfaceShell>
    );
  }

  const dashboard = await getRestaurantMenuManagement(user.id);
  const errorMessage = params.error ? errorMessages[params.error] : null;
  const updatedMessage = params.updated ? updatedMessages[params.updated] : null;

  if (!dashboard) {
    return (
      <SurfaceShell
        title="Меню ресторана"
        description="Этот аккаунт пока не привязан к ресторану."
      >
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-5 text-sm text-warning">
          Попросите администратора добавить пользователя в staff ресторана.
        </div>
      </SurfaceShell>
    );
  }

  return (
    <SurfaceShell
      title="Меню ресторана"
      description={`${dashboard.restaurant.name} · ${dashboard.restaurant.role}`}
    >
      {updatedMessage ? (
        <div className="mb-5 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
          {updatedMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          {errorMessage}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          href="/restaurant"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
        >
          Заказы
        </Link>
        <Link
          href={`/restaurants/${dashboard.restaurant.slug}`}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground/75 transition-colors hover:border-accent hover:text-accent"
        >
          Витрина
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <InfoTile label="Категории" value={String(dashboard.stats.categories)} />
        <InfoTile
          label="Активные"
          value={String(dashboard.stats.activeCategories)}
          tone="accent"
        />
        <InfoTile label="Блюда" value={String(dashboard.stats.items)} />
        <InfoTile
          label="Стоп / скрыто"
          value={String(dashboard.stats.unavailableItems)}
          tone={dashboard.stats.unavailableItems > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mt-6 grid gap-5">
        <CreateCategoryForm />

        {dashboard.categories.length > 0 ? (
          dashboard.categories.map((category) => (
            <section
              key={category.id}
              className="grid gap-5 rounded-lg border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-semibold">
                      {category.displayName}
                    </h2>
                    <StatusChip active={category.isActive}>
                      {category.isActive ? "Показывается" : "Скрыта"}
                    </StatusChip>
                  </div>
                  <div className="mt-1 text-sm text-foreground/55">
                    {category.items.length} поз.
                  </div>
                </div>
              </div>

              <CategoryForm category={category} />

              <div className="grid gap-3">
                {category.items.length > 0 ? (
                  category.items.map((item) => (
                    <ItemForm
                      key={item.id}
                      categories={dashboard.categories}
                      item={item}
                    />
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-5 text-sm text-foreground/60">
                    В категории пока нет блюд.
                  </div>
                )}
              </div>

              <CreateItemForm category={category} />
            </section>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-foreground/60">
            Создайте первую категорию.
          </div>
        )}
      </div>
    </SurfaceShell>
  );
}
