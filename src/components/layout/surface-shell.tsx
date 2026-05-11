import { AppHeader } from "@/components/layout/app-header";

type SurfaceShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export function SurfaceShell({
  title,
  description,
  children,
}: SurfaceShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-8 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-base leading-7 text-foreground/65">
            {description}
          </p>
        </div>
        {children}
      </main>
    </div>
  );
}
