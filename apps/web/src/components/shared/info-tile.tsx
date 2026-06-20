type InfoTileProps = {
  label: string;
  value: string;
  tone?: "default" | "accent" | "warning";
};

const toneClassName = {
  default: "border-border bg-surface text-foreground",
  accent: "border-accent/30 bg-accent/10 text-accent",
  warning: "border-warning/30 bg-warning/10 text-warning",
};

export function InfoTile({ label, value, tone = "default" }: InfoTileProps) {
  return (
    <div className={`rounded-lg border p-4 ${toneClassName[tone]}`}>
      <div className="text-sm text-current/65">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-normal">
        {value}
      </div>
    </div>
  );
}
