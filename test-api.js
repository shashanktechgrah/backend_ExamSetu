// Test API endpoints
const testAPI = async () => {
  try {
    console.log('🧪 Testing API endpoints...');
    
    // Test database connection
    console.log('\n1. Testing database connection...');
    const testResponse = await fetch('http://localhost:5000/api/test');
    const testData = await testResponse.json();
    console.log('✅ Database test:', testData);
    
    // Test classes endpoint
    console.log('\n2. Testing classes endpoint...');
    const classesResponse = await fetch('http://localhost:5000/api/classes');
    const classesData = await classesResponse.json();
    console.log('✅ Classes:', classesData);
    
    // Test subjects endpoint
    console.log('\n3. Testing subjects endpoint...');
    const subjectsResponse = await fetch('http://localhost:5000/api/subjects');
    const subjectsData = await subjectsResponse.json();
    console.log('✅ Subjects:', subjectsData);
    
    // Test analytics endpoint
    console.log('\n4. Testing analytics endpoint...');
    const analyticsResponse = await fetch('http://localhost:5000/api/analytics');
    const analyticsData = await analyticsResponse.json();
    console.log('✅ Analytics:', analyticsData);
    
    // Test question bank endpoint
    console.log('\n5. Testing question bank endpoint...');
    const qbResponse = await fetch('http://localhost:5000/api/question-bank');
    const qbData = await qbResponse.json();
    console.log('✅ Question Bank:', qbData);
    
    console.log('\n🎉 All API tests completed!');
    
  } catch (error) {
    console.error('❌ API test failed:', error);
  }
};

// Run tests
testAPI();
