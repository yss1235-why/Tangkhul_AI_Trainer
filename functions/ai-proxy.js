const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Parse request
    const requestBody = JSON.parse(event.body);
    const { messages } = requestBody;
    
    // Generate a simple test response instead of calling external APIs
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: "This is a test response from the AI proxy function. The external API calls are currently disabled for diagnostic purposes."
      })
    };
    
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};
