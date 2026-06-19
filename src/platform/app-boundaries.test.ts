import { describe, expect, it } from "vitest";
import {
  getPlatformSurfaceByAppPath,
  platformSplitTargets,
  platformSurfaces,
} from "@/platform/app-boundaries";

describe("platform app boundaries", () => {
  it("maps current App Router folders to future split packages", () => {
    expect(getPlatformSurfaceByAppPath("src/app/(customer)/checkout/page.tsx")?.id).toBe(
      "customer",
    );
    expect(getPlatformSurfaceByAppPath("src/app/restaurant/menu/page.tsx")?.id).toBe(
      "restaurant",
    );
    expect(getPlatformSurfaceByAppPath("src/app/operator/pilot/page.tsx")?.futurePackage).toBe(
      "apps/operator",
    );
  });

  it("keeps every web surface represented in the split target list", () => {
    const targetIds = new Set(platformSplitTargets.map((target) => target.id));

    for (const surface of platformSurfaces) {
      expect(targetIds.has(surface.id)).toBe(true);
    }

    expect(targetIds.has("worker")).toBe(true);
  });
});
