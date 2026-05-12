# Deliver

Food delivery platform prototype for Almaty.

## Getting Started

### Local database

Use a regular local PostgreSQL service for development. Do not use `prisma dev`
as the main app database; it has been unstable with the Prisma driver adapter in
this project.

Default local setup:

- PostgreSQL binaries: `E:\Apps\PostgreSQL\17\bin`
- Data directory: `E:\Projects\.postgres-data\deliver`
- Service: `postgresql-x64-17-deliver`
- Database: `deliver`
- URL: `postgresql://postgres:postgres@localhost:5432/deliver?schema=public`

Useful commands:

```bash
npm run db:local:status
npm run db:local:start
npm run db:local:stop
npm run db:local:psql
```

Apply schema and seed data:

```bash
npx prisma migrate deploy
npm run db:seed
```

### Development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
