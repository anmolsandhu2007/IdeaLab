import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-better-sqlite3', 'better-sqlite3', '@prisma/adapter-libsql', '@libsql/client'],
  poweredByHeader: false,
};
export default config;
