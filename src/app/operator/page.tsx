import { SurfaceShell } from "@/components/layout/surface-shell";
import { getOperatorOrders } from "@/domains/orders/queries";

export const dynamic = "force-dynamic";

export default async function OperatorPage() {
  const operatorQueue = await getOperatorOrders();

  return (
    <SurfaceShell
      title="Панель оператора"
      description="Оператор видит все заказы, состояние автоназначения и заказы, где нужна ручная помощь."
    >
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-surface-muted text-foreground/60">
            <tr>
              <th className="px-4 py-3 font-medium">Заказ</th>
              <th className="px-4 py-3 font-medium">Ресторан</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Сумма</th>
              <th className="px-4 py-3 font-medium">Курьер</th>
              <th className="px-4 py-3 font-medium">Диспетчеризация</th>
            </tr>
          </thead>
          <tbody>
            {operatorQueue.map((order) => (
              <tr key={order.number} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{order.number}</td>
                <td className="px-4 py-3">{order.restaurant}</td>
                <td className="px-4 py-3">{order.status}</td>
                <td className="px-4 py-3">{order.total}</td>
                <td className="px-4 py-3">{order.courier}</td>
                <td className="px-4 py-3">{order.dispatchState}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SurfaceShell>
  );
}
