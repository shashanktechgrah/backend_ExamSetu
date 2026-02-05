// Test Backend Login API
// Quick test to verify backend authentication is working

const testBackendLogin = async () => {
  console.log('🔧 Testing Backend Login API...\n');

  const testCases = [
    {
      name: 'Admin Login',
      email: 'admin@testportal.com',
      password: '123456'
    },
    {
      name: 'Teacher Login', 
      email: 'teacher@testportal.com',
      password: '123456'
    },
    {
      name: 'Student Login',
      email: 'student@student.com', 
      password: '123456'
    },
    {
      name: 'Wrong Password',
      email: 'admin@testportal.com',
      password: 'wrongpassword'
    },
    {
      name: 'Wrong Email',
      email: 'wrong@testportal.com',
      password: '123456'
    }
  ];

  for (const testCase of testCases) {
    try {
      console.log(`📋 Testing: ${testCase.name}`);
      
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testCase.email,
          password: testCase.password
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        console.log(`✅ SUCCESS - ${testCase.name}`);
        console.log(`   Role: ${data.user.role}`);
        console.log(`   Name: ${data.user.name}`);
        console.log(`   Email: ${data.user.email}`);
      } else {
        console.log(`❌ FAILED - ${testCase.name}`);
        console.log(`   Error: ${data.error}`);
      }
      
    } catch (error) {
      console.log(`❌ ERROR - ${testCase.name}`);
      console.log(`   Message: ${error.message}`);
    }
    
    console.log(''); // Empty line for readability
  }
};

// Run the test
testBackendLogin().then(() => {
  console.log('🎉 Backend API testing completed!');
  console.log('\n💡 If all tests pass, your backend is ready for frontend integration.');
}).catch(error => {
  console.error('❌ Backend test failed:', error);
  console.log('\n⚠️  Make sure your backend server is running on port 5000');
});
