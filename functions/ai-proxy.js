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

  console.log('Request received');

  try {
    // Parse the incoming request body
    const requestBody = JSON.parse(event.body);
    
    // Log the full structure for debugging
    console.log('Request body structure:', JSON.stringify(requestBody));
    
    // Extract information correctly based on how ChatContext.js sends it
    const messagesArray = requestBody.messages || [];
    const apiProvider = requestBody.apiProvider || 'chatgpt';
    
    if (!messagesArray.length) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          response: "I couldn't process your message. Please try again.",
          error: "No messages provided"
        })
      };
    }
    
    // Get the most recent user message
    const userMessages = messagesArray.filter(msg => msg.role === "user");
    const latestUserMessage = userMessages.length ? userMessages[userMessages.length - 1].content : "";
    
    console.log('Latest user message:', latestUserMessage);
    
    if (!latestUserMessage) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          response: "I couldn't understand your last message. Could you please try again?",
          error: "Empty user message"
        })
      };
    }
    
    // Try Perplexity first (primary service)
    try {
      console.log('Attempting Perplexity API call with messages array');
      const perplexityResponse = await callPerplexityAPI(messagesArray);
      console.log('Perplexity API call successful');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: perplexityResponse,
          provider: 'perplexity'
        })
      };
    } catch (perplexityError) {
      // Log the full error for debugging
      console.error('Perplexity API error:', perplexityError);
      console.log('Falling back to OpenAI API');
      
      // Only pass the latest user message to OpenAI as fallback
      const openaiResponse = await callOpenAIAPI(latestUserMessage);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: openaiResponse,
          provider: 'openai',
          fallback: true
        })
      };
    }
  } catch (error) {
    // Detailed error logging
    console.error('Function error:', error);
    console.error('Error stack:', error.stack);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: "I'm having trouble processing your message. Could you please try again or rephrase?",
        error: error.message
      })
    };
  }
};

async function callPerplexityAPI(messagesArray) {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  
  if (!perplexityKey) {
    throw new Error('Missing Perplexity API key');
  }
  
  // Log the messages we're sending to Perplexity
  console.log('Sending to Perplexity:', JSON.stringify(messagesArray));
  
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${perplexityKey}`
    },
    body: JSON.stringify({
      model: 'sonar-reasoning',
      messages: messagesArray,
      max_tokens: 150,
      temperature: 0.7
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity API error: ${response.status}, ${errorText}`);
  }
  
  const data = await response.json();
  
  // Log the response for debugging
  console.log('Perplexity response:', JSON.stringify(data));
  
  let aiResponse = data.choices[0].message.content;
  
  // Remove thinking sections if present
  aiResponse = aiResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  
  return aiResponse;
}

async function callOpenAIAPI(userMessage) {
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiKey) {
    throw new Error('Missing OpenAI API key');
  }
  
  // Check if message might be in Tangkhul (simple check for special characters)
  const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
  const prompt = hasTangkhulChars
    ? `You are an AI assistant collecting Tangkhul language examples. The user has sent what appears to be a Tangkhul phrase: "${userMessage}". Ask them politely what it means in English.`
    : `You are an AI assistant collecting Tangkhul language examples. The user has sent a message in English: "${userMessage}". Respond appropriately in English and ask ONE question to elicit Tangkhul language examples.`;
  
  console.log('OpenAI prompt:', prompt);
  
  const response = await fetch('https://api.openai.com/v1/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo-instruct',
      prompt: prompt,
      max_tokens: 150,
      temperature: 0.7
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status}, ${errorText}`);
  }
  
  const data = await response.json();
  return data.choices[0].text.trim();
}
