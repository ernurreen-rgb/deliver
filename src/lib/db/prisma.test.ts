import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prismaPg: vi.fn(function PrismaPg(config: unknown) {
    return { config };
  }),
  prismaClient: vi.fn(function PrismaClient(options: unknown) {
    return { options };
  }),
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: mocks.prismaPg,
}));

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: mocks.prismaClient,
}));

function clearGlobalPrisma() {
  delete (globalThis as typeof globalThis & { prisma?: unknown }).prisma;
}

describe("getPrisma", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.prismaPg.mockClear();
    mocks.prismaClient.mockClear();
    clearGlobalPrisma();
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://app:secret@db.example.com/deliver",
    );
    vi.stubEnv("DATABASE_POOL_MAX", "4");
    vi.stubEnv("DATABASE_CONNECTION_TIMEOUT_MS", "4000");
    vi.stubEnv("DATABASE_IDLE_TIMEOUT_MS", "9000");
  });

  afterEach(() => {
    clearGlobalPrisma();
    vi.unstubAllEnvs();
  });

  it("reuses one client and passes bounded pg settings to the adapter", async () => {
    const { getPrisma } = await import("@/lib/db/prisma");

    const first = getPrisma();
    const second = getPrisma();

    expect(second).toBe(first);
    expect(mocks.prismaPg).toHaveBeenCalledOnce();
    expect(mocks.prismaPg).toHaveBeenCalledWith({
      connectionString: "postgresql://app:secret@db.example.com/deliver",
      max: 4,
      connectionTimeoutMillis: 4_000,
      idleTimeoutMillis: 9_000,
    });
    expect(mocks.prismaClient).toHaveBeenCalledOnce();
    expect(mocks.prismaClient).toHaveBeenCalledWith({
      adapter: expect.any(Object),
      log: ["error"],
    });
  });
});
