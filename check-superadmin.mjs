import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL tanımlı değil. Bu yardımcı script yalnızca açıkça verilen bağlantı ile çalışır.");
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function checkSuperadmin() {
  try {
    console.log('Checking superadmin users...\n');
    
    const superadmins = await prisma.user.findMany({
      where: { role: 'SUPERADMIN' },
      select: {
        id: true,
        identityNo: true,
        fullName: true,
        role: true,
        isActive: true,
        passwordHash: true,
      }
    });

    console.log('Superadmin users found:', superadmins.length);
    for (const u of superadmins) {
      console.log(`\n  - TC: ${u.identityNo}, Name: ${u.fullName}, Active: ${u.isActive}`);
      console.log(`    Hash: ${u.passwordHash?.substring(0, 20)}...`);
      
      // Test password verification
      const testPassword = process.env.TEST_SUPERADMIN_PASSWORD || "";
      if (!testPassword) {
        console.log("    Password check skipped: TEST_SUPERADMIN_PASSWORD is not set.");
        continue;
      }
      try {
        const isValid = await bcrypt.compare(testPassword, u.passwordHash);
        console.log(`    Password matches: ${isValid}`);
      } catch (err) {
        console.log(`    Password verification error: ${err.message}`);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSuperadmin();
