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
    let { messages, apiProvider } = requestBody;
    
    if (!messages || !Array.isArray(messages)) {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: 'Invalid messages format' })
      };
    }
    
    // Replace or add the system message with improved formatting instructions
    messages = updateSystemMessage(messages);
    
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
      console.error('Primary API error:', apiError);
      try {
        response = apiProvider === 'perplexity' 
          ? await callChatGPTAPI(messages) 
          : await callPerplexityAPI(messages);
      } catch (fallbackError) {
        console.error('Fallback API error:', fallbackError);
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
    
    // Process the response: remove thinking section and improve formatting
    response = processResponse(response);
    console.log(`Response length: ${response ? response.length : 0} characters`);
    
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ response, usedFallback: error !== null })
    };
  } catch (error) {
    console.error('General function error:', error);
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      })
    };
  }
};

function updateSystemMessage(messages) {
  const systemMessageContent = "You are an AI assistant designed to collect Tangkhul language examples from human trainers. Follow these guidelines: 1) Use only English in your responses. 2) Ask only ONE question at a time. 3) Format your responses with clear paragraphs and proper spacing. 4) Focus on eliciting specific Tangkhul language examples, grammar clarifications, or vocabulary. 5) Keep your responses concise and focused. 6) Maintain a professional, formal tone appropriate for language instruction.";
  
  // Check if there's already a system message
  const systemMessageIndex = messages.findIndex(msg => msg.role === "system");
  
  if (systemMessageIndex !== -1) {
    // Replace existing system message
    messages[systemMessageIndex].content = systemMessageContent;
  } else {
    // Add system message at the beginning
    messages.unshift({
      role: "system",
      content: systemMessageContent
    });
  }
  
  return messages;
}

function processResponse(text) {
  if (typeof text !== 'string') return text;
  
  // Remove thinking section
  let processed = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  
  // Handle improperly formatted tags
  if (processed.includes('<think>')) {
    processed = processed.replace(/<think>[\s\S]*?\n\n/g, '');
  }
  processed = processed.replace(/<\/think>/g, '');
  
  // Remove any remaining thinking sections
  const thinkIndex = processed.indexOf('<think>');
  if (thinkIndex !== -1) {
    processed = processed.substring(0, thinkIndex);
  }
  
  // Improve formatting
  processed = processed.trim()
    // Ensure double spacing after periods for paragraph breaks
    .replace(/\.(\s*)(?=[A-Z])/g, '.\n\n')
    // Remove excessive blank lines (more than 2 consecutive newlines)
    .replace(/\n{3,}/g, '\n\n')
    // Ensure proper spacing around question marks
    .replace(/\?(\s*)(?=[A-Z])/g, '?\n\n');
  
  return processed;
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
      model: 'sonar-reasoning',
      messages: messages,
      max_tokens: 2000
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity API error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  console.log('Perplexity API response data structure:', Object.keys(data));
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Invalid Perplexity API response structure');
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
      max_tokens: 2000
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Invalid OpenAI API response structure');
  }
  
  return data.choices[0].message.content;
}
