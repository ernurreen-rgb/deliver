import { describe, expect, it } from "vitest";
import { platformSurfaces } from "@/platform/app-boundaries";
import { surfaceShells, type AppShellSurfaceId } from "@/platform/navigation";

describe("surface navigation", () => {
  it("defines a shell for every user-facing surface", () => {
    const userFacingSurfaces = platformSurfaces
      .filter((surface) => surface.id !== "api")
      .map((surface) => surface.id as AppShellSurfaceId);

    for (const surface of userFacingSurfaces) {
      expect(surfaceShells[surface]).toBeDefined();
      expect(surfaceShells[surface].homeHref).toMatch(/^\//);
      expect(surfaceShells[surface].navItems.length).toBeGreaterThan(0);
    }
  });
});
