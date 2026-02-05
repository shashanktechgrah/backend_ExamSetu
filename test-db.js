const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log('Testing database connection...');
    
    // Test basic connection
    await prisma.$connect();
    console.log('✅ Database connected successfully!');
    
    // Test user query
    const usersCount = await prisma.user.count();
    console.log(`✅ Found ${usersCount} users in database`);
    
    // Test classes query
    const classesCount = await prisma.class.count();
    console.log(`✅ Found ${classesCount} classes in database`);
    
    // Test subjects query
    const subjectsCount = await prisma.subject.count();
    console.log(`✅ Found ${subjectsCount} subjects in database`);
    
    // Test question bank query
    const questionsCount = await prisma.questionBank.count();
    console.log(`✅ Found ${questionsCount} questions in database`);
    
    console.log('✅ All database connections working correctly!');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
