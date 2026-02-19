// prisma.config.ts
// ✅ Prisma 7+ requires connection URL here instead of schema.prisma
// Place this file at: Backend/prisma.config.ts  (same level as package.json)

import { defineConfig } from 'prisma/config'
import { PrismaPg }     from '@prisma/adapter-pg'
import { Pool }         from 'pg'

export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',

  migrate: {
    async adapter() {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL })
      return new PrismaPg(pool)
    },
  },
})
