import { CartSummary } from "@/components/cart/cart-summary";
import { SurfaceShell } from "@/components/layout/surface-shell";

export default function CartPage() {
  return (
    <SurfaceShell
      title="Корзина"
      description="Позиции сохраняются локально. Перед созданием заказа цены и доступность будут проверяться на сервере."
    >
      <div className="max-w-2xl">
        <CartSummary />
      </div>
    </SurfaceShell>
  );
}
