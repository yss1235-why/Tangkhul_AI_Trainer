// functions/ai-proxy.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  try {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    
    const requestBody = JSON.parse(event.body);
    const { messages, apiProvider } = requestBody;
    
    let response;
    
    if (apiProvider === 'perplexity') {
      response = await callPerplexityAPI(messages);
    } else {
      response = await callChatGPTAPI(messages);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ response })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
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
  
  const data = await response.json();
  return data.choices[0].message.content;
}
