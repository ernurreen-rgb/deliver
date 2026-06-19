import { AppHeader } from "@/components/layout/app-header";
import type { AppShellSurfaceId } from "@/platform/navigation";

type RoleShellProps = {
  surface: AppShellSurfaceId;
  children: React.ReactNode;
};

export function RoleShell({ surface, children }: RoleShellProps) {
  return (
    <div className="min-h-screen bg-background" data-role-shell={surface}>
      <AppHeader surface={surface} />
      {children}
    </div>
  );
}
