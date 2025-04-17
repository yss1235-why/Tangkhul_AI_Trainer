const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (error) {
  console.error('Error parsing service account:', error);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL
  });
}

exports.handler = async function(event, context) {
  try {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    
    const requestBody = JSON.parse(event.body);
    const { startDate, endDate } = requestBody;
    
    const db = admin.database();
    const examplesRef = db.ref('languageExamples');
    
    // Query examples within date range
    const snapshot = await examplesRef
      .orderByChild('timestamp')
      .startAt(startDate)
      .endAt(endDate)
      .once('value');
    
    const examples = [];
    snapshot.forEach((childSnapshot) => {
      examples.push({
        id: childSnapshot.key,
        ...childSnapshot.val()
      });
    });
    
    // Generate CSV or JSON (using JSON for this example)
    const dataset = {
      metadata: {
        exportDate: Date.now(),
        startDate,
        endDate,
        totalExamples: examples.length
      },
      examples
    };
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="tangkhul-dataset-${new Date().toISOString().slice(0, 10)}.json"`
      },
      body: JSON.stringify(dataset, null, 2)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
