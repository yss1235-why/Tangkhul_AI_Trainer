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
    const requestBody = JSON.parse(event.body);
    let { messages, apiProvider } = requestBody;
    
    // Ensure message array is valid
    if (!messages || !Array.isArray(messages)) {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: 'Invalid messages format' })
      };
    }
    
    // Limit conversation context length to prevent overload
    if (messages.length > 10) {
      // Keep system message and last 9 exchanges
      const systemMessage = messages.find(msg => msg.role === "system");
      const recentMessages = messages.slice(-9);
      messages = systemMessage ? [systemMessage, ...recentMessages] : recentMessages;
    }
    
    try {
      // Default to OpenAI for more reliable response handling
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
          max_tokens: 1000,
          temperature: 0.7
        })
      });
      
      if (!response.ok) {
        throw new Error(`OpenAI API error (${response.status})`);
      }
      
      const data = await response.json();
      let aiResponse = data.choices[0].message.content;
      
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ response: aiResponse })
      };
    } catch (error) {
      console.error('API error:', error);
      return {
        statusCode: 502, headers,
        body: JSON.stringify({ 
          error: 'External API service error', 
          details: error.message 
        })
      };
    }
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      })
    };
  }
};
