/**
 * Creates the first SUPER_ADMIN. Idempotent.
 *   SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='long-random-pass' bun run db:seed
 */
import { PrismaClient } from '@prisma/client';

const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
if (!email || !password || password.length < 12) {
  console.error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (min 12 chars).');
  process.exit(1);
}

const db = new PrismaClient();
try {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists (role ${existing.role}); nothing to do.`);
  } else {
    await db.user.create({
      data: {
        email,
        name: 'Administrator',
        role: 'SUPER_ADMIN',
        passwordHash: await Bun.password.hash(password, { algorithm: 'argon2id' })
      }
    });
    console.log(`Created SUPER_ADMIN ${email}`);
  }
} finally {
  await db.$disconnect();
}
