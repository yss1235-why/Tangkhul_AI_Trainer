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
    const requestBody = JSON.parse(event.body);
    
    // Extract the user message from the messages array structure
    let userMessage = "";
    
    if (requestBody.message) {
      // If message is sent directly (simple format)
      userMessage = requestBody.message;
    } else if (requestBody.messages && Array.isArray(requestBody.messages)) {
      // If messages array is provided (chat format)
      // Find the last user message in the array
      const userMessages = requestBody.messages.filter(msg => msg.role === "user");
      if (userMessages.length > 0) {
        userMessage = userMessages[userMessages.length - 1].content;
      }
    }
    
    console.log('Processed user message:', userMessage);
    
    if (!userMessage) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          response: "I couldn't understand your message. Could you please try again?",
          error: "No user message found"
        })
      };
    }
    
    // Simple language detection
    const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
    
    // Try Perplexity first (primary service)
    try {
      console.log('Attempting Perplexity API call');
      const perplexityResponse = await callPerplexityAPI(userMessage, requestBody.messages);
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
      // Log the error and fall back to OpenAI
      console.error('Perplexity API error:', perplexityError);
      console.log('Falling back to OpenAI API');
      
      const openaiResponse = await callOpenAIAPI(userMessage);
      
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
    console.error('Function error:', error);
    
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

async function callPerplexityAPI(userMessage, previousMessages = []) {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  
  if (!perplexityKey) {
    throw new Error('Missing Perplexity API key');
  }
  
  // Prepare messages array for API call
  let messages = [
    {
      role: "system",
      content: "You are an AI assistant designed to collect Tangkhul language examples. Use only English in your responses. Ask only ONE question at a time. Focus on eliciting specific language examples. Important: Determine if the user's message is in English or Tangkhul before responding. If it's in English, respond appropriately without asking for a translation. Tangkhul language typically contains special characters like macrons (ā, Ā) and underlines (a̲, A̲)."
    }
  ];
  
  // If previous messages array is provided, use it
  if (Array.isArray(previousMessages) && previousMessages.length > 0) {
    messages = previousMessages;
  } else {
    // Otherwise just add the user message
    messages.push({
      role: "user",
      content: userMessage
    });
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
      max_tokens: 150,
      temperature: 0.7
    })
  });
  
  if (!response.ok) {
    throw new Error(`Perplexity API error: ${response.status}`);
  }
  
  const data = await response.json();
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
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.choices[0].text.trim();
}
