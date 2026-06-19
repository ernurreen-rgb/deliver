import "dotenv/config";
import { getPrisma } from "../src/lib/db/prisma";
import { getReleaseTarget } from "../src/lib/release-env";

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const POSTGRES_HOST_OVERRIDE_PARAMS = new Set(["host", "hostaddr"]);

function requireLocalDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const url = new URL(databaseUrl);
  const isPostgres = url.protocol === "postgresql:" || url.protocol === "postgres:";
  const databaseName = url.pathname.replace(/^\//, "");
  const hostOverride = Array.from(url.searchParams.keys()).find((key) =>
    POSTGRES_HOST_OVERRIDE_PARAMS.has(key.toLowerCase()),
  );

  if (hostOverride) {
    throw new Error(
      `Refusing DATABASE_URL query parameter "${hostOverride}" because it can override the checked host or select a socket path.`,
    );
  }

  if (!isPostgres || !LOCAL_DATABASE_HOSTS.has(url.hostname)) {
    throw new Error(
      "Refusing to reset auth rate limits outside a local PostgreSQL database.",
    );
  }

  if (databaseName !== "deliver") {
    throw new Error(
      `Refusing to reset auth rate limits for database "${databaseName}". Expected local database "deliver".`,
    );
  }

  return {
    database: databaseName,
    host: url.hostname,
  };
}

async function main() {
  const releaseTarget = getReleaseTarget(process.env);

  if (releaseTarget !== "local") {
    throw new Error(
      "Refusing to reset auth rate limits unless RELEASE_TARGET is local or unset.",
    );
  }

  const database = requireLocalDatabaseUrl();
  const prisma = getPrisma();
  const result = await prisma.rateLimitBucket.deleteMany({
    where: {
      key: {
        startsWith: "otp:",
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        database,
        deletedBuckets: result.count,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
