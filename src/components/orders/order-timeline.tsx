import type { OrderTimeline } from "@/domains/orders/timeline";

const timelineDateFormatter = new Intl.DateTimeFormat("ru-KZ", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function OrderTimelinePanel({
  className,
  compact = false,
  timeline,
}: {
  className?: string;
  compact?: boolean;
  timeline: OrderTimeline;
}) {
  const events = compact ? timeline.events.slice(0, 4) : timeline.events;

  return (
    <div className={className}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-sm text-foreground/55">Сейчас</div>
          <div className="mt-1 font-semibold">{timeline.currentStep.title}</div>
          <div className="mt-1 text-sm leading-5 text-foreground/60">
            {timeline.currentStep.detail}
          </div>
        </div>
        <div>
          <div className="text-sm text-foreground/55">Следующий шаг</div>
          <div className="mt-1 font-semibold">{timeline.nextStep.title}</div>
          <div className="mt-1 text-sm leading-5 text-foreground/60">
            {timeline.nextStep.detail}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="text-sm font-semibold">История</div>
        {events.length > 0 ? (
          <ol className="mt-3 grid gap-3">
            {events.map((event) => (
              <li key={event.id} className="grid grid-cols-[10px_1fr] gap-3">
                <span
                  className={`mt-1.5 h-2.5 w-2.5 rounded-full ${
                    event.source === "audit" ? "bg-accent" : "bg-foreground/35"
                  }`}
                />
                <div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">{event.title}</span>
                    <span className="text-xs text-foreground/45">
                      {timelineDateFormatter.format(event.occurredAt)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-foreground/60">
                    {event.actor} · {event.detail}
                  </div>
                  {event.reason ? (
                    <div className="mt-1 text-sm text-foreground/55">
                      Причина/комментарий: {event.reason}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-3 text-sm text-foreground/60">
            По заказу пока нет записанных действий.
          </div>
        )}
      </div>
    </div>
  );
}
