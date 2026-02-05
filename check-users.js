const { PrismaClient } = require('./node_modules/@prisma/client');

const prisma = new PrismaClient();

async function checkUsersCount() {
  try {
    console.log('🔍 Checking users table...');
    
    // Get total count
    const totalUsers = await prisma.user.count();
    console.log(`\n📊 Total users in database: ${totalUsers}`);
    
    // Get users by role
    const adminUsers = await prisma.user.count({
      where: { role: 'ADMIN' }
    });
    console.log(`👑 Admin users: ${adminUsers}`);
    
    const teacherUsers = await prisma.user.count({
      where: { role: 'TEACHER' }
    });
    console.log(`👨‍🏫 Teacher users: ${teacherUsers}`);
    
    const studentUsers = await prisma.user.count({
      where: { role: 'STUDENT' }
    });
    console.log(`👨‍🎓 Student users: ${studentUsers}`);
    
    // Get all users with details
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log('\n📋 All Users:');
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email}) - ${user.role} - ${user.status} - Created: ${user.createdAt.toLocaleDateString()}`);
    });
    
    console.log('\n✅ User count check completed!');
    
  } catch (error) {
    console.error('❌ Error checking users:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsersCount();
