// setup-symlink.js
// This script handles symlink creation for the build process
const fs = require('fs');
const path = require('path');

console.log('Setting up build environment...');

// Create functions directory if it doesn't exist
const functionsDir = path.join(__dirname, 'functions');
if (!fs.existsSync(functionsDir)) {
  fs.mkdirSync(functionsDir, { recursive: true });
  console.log('Created functions directory');
}

// Ensure .env variables are properly loaded
try {
  // Check if .env file exists and create a minimal one if needed
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.log('Creating minimal .env file for build process');
    const envContent = `# Environment variables for build
REACT_APP_FIREBASE_API_KEY=placeholder
REACT_APP_FIREBASE_AUTH_DOMAIN=placeholder
REACT_APP_FIREBASE_PROJECT_ID=placeholder
REACT_APP_FIREBASE_STORAGE_BUCKET=placeholder
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=placeholder
REACT_APP_FIREBASE_APP_ID=placeholder
REACT_APP_FIREBASE_MEASUREMENT_ID=placeholder
REACT_APP_FIREBASE_DATABASE_URL=placeholder
`;
    fs.writeFileSync(envPath, envContent);
  }
} catch (error) {
  console.error('Error setting up environment:', error);
  // Don't fail the build, just log the error
}

console.log('Setup completed successfully');
