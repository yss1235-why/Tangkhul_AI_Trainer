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

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, headers, 
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }
  
  try {
    const requestBody = JSON.parse(event.body);
    const { messages, apiProvider } = requestBody;
    
    if (!messages || !Array.isArray(messages)) {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: 'Invalid messages format' })
      };
    }
    
    let response;
    let error = null;
    
    try {
      if (apiProvider === 'perplexity') {
        response = await callPerplexityAPI(messages);
      } else {
        response = await callChatGPTAPI(messages);
      }
    } catch (apiError) {
      error = apiError;
      try {
        response = apiProvider === 'perplexity' 
          ? await callChatGPTAPI(messages) 
          : await callPerplexityAPI(messages);
      } catch (fallbackError) {
        return {
          statusCode: 502, headers,
          body: JSON.stringify({ 
            error: 'Both API services failed',
            primaryError: apiError.message,
            fallbackError: fallbackError.message
          })
        };
      }
    }
    
    // Remove the thinking section from the response
    response = removeThinkingSection(response);
    
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ response, usedFallback: error !== null })
    };
  } catch (error) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      })
    };
  }
};

// Function to remove thinking section
function removeThinkingSection(text) {
  if (typeof text !== 'string') return text;
  
  // Remove content between <think> and </think> tags
  return text.replace(/<think>[\s\S]*?<\/think>/g, '');
}

async function callPerplexityAPI(messages) {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  
  if (!perplexityKey) {
    throw new Error('Missing Perplexity API key');
  }
  
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${perplexityKey}`
    },
    body: JSON.stringify({
      model: 'sonar-reasoning-pro',
      messages: messages,
      max_tokens: 500
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity API error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error(`Invalid response from Perplexity API: ${JSON.stringify(data)}`);
  }
  
  return data.choices[0].message.content;
}

async function callChatGPTAPI(messages) {
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiKey) {
    throw new Error('Missing OpenAI API key');
  }
  
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
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error(`Invalid response from OpenAI API: ${JSON.stringify(data)}`);
  }
  
  return data.choices[0].message.content;
}
