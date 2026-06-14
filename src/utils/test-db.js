import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('Testing connection to database...');
  console.log('Using DATABASE_URL:', process.env.DATABASE_URL ? '(Loaded)' : '(NOT LOADED)');
  
  try {
    // Attempt to query users
    const usersCount = await prisma.user.count();
    console.log('✅ Successfully connected to the database!');
    console.log(`✅ User table exists and has ${usersCount} records.`);
  } catch (error) {
    console.error('❌ Connection or query failed!');
    console.error('Error Details:', error.message);
    if (error.code) {
      console.error('Error Code:', error.code);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
