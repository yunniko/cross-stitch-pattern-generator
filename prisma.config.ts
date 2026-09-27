// Prisma 7's CLI reads its own config file rather than the schema's datasource block directly.
// Same shape as listing-studio's/arfid-meals' (D244): schema path, migrations path, and DATABASE_URL
// loaded from .env for local commands (`npx prisma migrate dev`, etc.) -- the deployed `migrate`
// container passes DATABASE_URL as a real environment variable instead, which `dotenv/config` leaves
// alone when it is already set.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
