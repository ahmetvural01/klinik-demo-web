import bcrypt from 'bcryptjs';

async function testPassword() {
  const plainPassword = '10711453';
  
  // Create hash like seed does
  const hashedPassword = await bcrypt.hash(plainPassword, 10);
  console.log('Hashed password:', hashedPassword);
  
  // Try to verify
  const isValid = await bcrypt.compare(plainPassword, hashedPassword);
  console.log('Verification result:', isValid);
  
  // Test with a known hash from seed (if needed later)
  const knownHash = '$2a$10$...'; // Replace with actual hash from DB if needed
}

testPassword().catch(console.error);
