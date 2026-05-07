import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:2653@localhost:5432/klinik_modern?schema=public"
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
      const testPassword = '10711453';
      try {
        const isValid = await bcrypt.compare(testPassword, u.passwordHash);
        console.log(`    Password '${testPassword}' matches: ${isValid}`);
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
