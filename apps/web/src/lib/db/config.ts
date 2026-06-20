export const DATABASE_POOL_MAX_ENV = "DATABASE_POOL_MAX";
export const DATABASE_CONNECTION_TIMEOUT_MS_ENV =
  "DATABASE_CONNECTION_TIMEOUT_MS";
export const DATABASE_IDLE_TIMEOUT_MS_ENV = "DATABASE_IDLE_TIMEOUT_MS";

type DatabaseEnv = Record<string, string | undefined>;

type IntegerSetting = {
  name: string;
  defaultValue: number;
  min: number;
  max: number;
};

const POOL_SETTINGS = {
  max: {
    name: DATABASE_POOL_MAX_ENV,
    defaultValue: 5,
    min: 1,
    max: 20,
  },
  connectionTimeoutMillis: {
    name: DATABASE_CONNECTION_TIMEOUT_MS_ENV,
    defaultValue: 5_000,
    min: 1_000,
    max: 30_000,
  },
  idleTimeoutMillis: {
    name: DATABASE_IDLE_TIMEOUT_MS_ENV,
    defaultValue: 10_000,
    min: 1_000,
    max: 60_000,
  },
} satisfies Record<string, IntegerSetting>;

function readIntegerSetting(env: DatabaseEnv, setting: IntegerSetting) {
  const rawValue = env[setting.name]?.trim();

  if (!rawValue) {
    return setting.defaultValue;
  }

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(
      `${setting.name} must be an integer between ${setting.min} and ${setting.max}.`,
    );
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value < setting.min || value > setting.max) {
    throw new Error(
      `${setting.name} must be an integer between ${setting.min} and ${setting.max}.`,
    );
  }

  return value;
}

export function getPrismaPoolSettings(env: DatabaseEnv = process.env) {
  return {
    max: readIntegerSetting(env, POOL_SETTINGS.max),
    connectionTimeoutMillis: readIntegerSetting(
      env,
      POOL_SETTINGS.connectionTimeoutMillis,
    ),
    idleTimeoutMillis: readIntegerSetting(
      env,
      POOL_SETTINGS.idleTimeoutMillis,
    ),
  };
}

export function createPrismaPgConfig(env: DatabaseEnv = process.env) {
  const connectionString = env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to initialize Prisma.");
  }

  return {
    connectionString,
    ...getPrismaPoolSettings(env),
  };
}
