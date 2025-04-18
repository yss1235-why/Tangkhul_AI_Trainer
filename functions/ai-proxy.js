const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  // CORS headers for browser requests
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }
  
  try {
    const requestBody = JSON.parse(event.body);
    const { messages, apiProvider } = requestBody;
    
    // Validate input
    if (!messages || !Array.isArray(messages)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid messages format' })
      };
    }
    
    let response;
    
    // Try preferred API with fallback
    try {
      if (apiProvider === 'perplexity') {
        response = await callPerplexityAPI(messages);
      } else {
        response = await callChatGPTAPI(messages);
      }
    } catch (apiError) {
      console.error(`Error with ${apiProvider} API:`, apiError);
      
      // If first API fails, try fallback
      try {
        response = apiProvider === 'perplexity' 
          ? await callChatGPTAPI(messages) 
          : await callPerplexityAPI(messages);
      } catch (fallbackError) {
        console.error('Fallback API also failed:', fallbackError);
        return {
          statusCode: 502,
          headers,
          body: JSON.stringify({ 
            error: 'Both API services failed',
            details: apiError.message
          })
        };
      }
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ response })
    };
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      })
    };
  }
};

async function callPerplexityAPI(messages) {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${perplexityKey}`
    },
    body: JSON.stringify({
      model: 'sonar-medium-online',
      messages: messages,
      max_tokens: 500
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity API error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
}

async function callChatGPTAPI(messages) {
  const openaiKey = process.env.OPENAI_API_KEY;
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: 500
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
}
