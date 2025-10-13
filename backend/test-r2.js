const AWS = require('aws-sdk');
require('dotenv').config();

// Configure AWS SDK for Cloudflare R2
const s3 = new AWS.S3({
  endpoint: process.env.R2_ENDPOINT,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  region: 'auto', // Cloudflare R2 uses 'auto' region
  signatureVersion: 'v4',
});

async function testR2Connection() {
  try {
    console.log('🔍 Testing Cloudflare R2 connection...');
    console.log('Endpoint:', process.env.R2_ENDPOINT);
    console.log('Bucket:', process.env.R2_BUCKET_NAME);
    
    // Test 1: List buckets
    console.log('\n📋 Listing buckets...');
    const buckets = await s3.listBuckets().promise();
    console.log('✅ Buckets found:', buckets.Buckets.map(b => b.Name));
    
    // Test 2: Check if our bucket exists
    const bucketExists = buckets.Buckets.some(b => b.Name === process.env.R2_BUCKET_NAME);
    if (!bucketExists) {
      console.log('⚠️  Bucket not found, creating it...');
      await s3.createBucket({ Bucket: process.env.R2_BUCKET_NAME }).promise();
      console.log('✅ Bucket created successfully');
    } else {
      console.log('✅ Bucket exists');
    }
    
    // Test 3: Upload a test file
    console.log('\n📤 Testing file upload...');
    const testContent = 'Hello from PromoAtlas PIM System! ' + new Date().toISOString();
    const uploadResult = await s3.upload({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: 'test/connection-test.txt',
      Body: testContent,
      ContentType: 'text/plain'
    }).promise();
    
    console.log('✅ File uploaded successfully');
    console.log('Location:', uploadResult.Location);
    
    // Test 4: Download the test file
    console.log('\n📥 Testing file download...');
    const downloadResult = await s3.getObject({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: 'test/connection-test.txt'
    }).promise();
    
    const downloadedContent = downloadResult.Body.toString();
    console.log('✅ File downloaded successfully');
    console.log('Content:', downloadedContent);
    
    // Test 5: Delete the test file
    console.log('\n🗑️  Cleaning up test file...');
    await s3.deleteObject({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: 'test/connection-test.txt'
    }).promise();
    console.log('✅ Test file deleted');
    
    console.log('\n🎉 All R2 tests passed! Storage is working perfectly.');
    return true;
    
  } catch (error) {
    console.error('❌ R2 connection test failed:', error.message);
    return false;
  }
}

testR2Connection().then(success => {
  process.exit(success ? 0 : 1);
});
