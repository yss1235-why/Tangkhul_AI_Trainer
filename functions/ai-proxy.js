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
    // Parse request body
    const requestBody = JSON.parse(event.body);
    console.log('Request body keys:', Object.keys(requestBody));
    
    // Extract message data
    let userMessage = "";
    let messagesArray = [];
    
    // Try to extract message from various possible structures
    if (requestBody.messages && Array.isArray(requestBody.messages)) {
      messagesArray = requestBody.messages;
      const userMessages = messagesArray.filter(msg => msg.role === "user");
      if (userMessages.length > 0) {
        userMessage = userMessages[userMessages.length - 1].content;
      }
    } else if (requestBody.message) {
      userMessage = requestBody.message;
    }
    
    console.log('User message:', userMessage);
    
    if (!userMessage) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: "I'd like to learn some Tangkhul phrases. Could you share a word or sentence in Tangkhul with me?\n\n(Fallback System)",
          provider: 'fallback'
        })
      };
    }
    
    // Initial language detection for better handling
    const normalizedMessage = userMessage.toLowerCase().trim();
    
    // Special handling for "okay" and its variants
    const isOkay = ['okay', 'ok', 'k', 'kk', 'alright', 'alrighty', 'sure'].includes(normalizedMessage);
    
    if (isOkay) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: "Great! I'd love to learn some Tangkhul phrases. Could you teach me a word or phrase in Tangkhul language?\n\n(Direct Response)",
          provider: 'direct'
        })
      };
    }
    
    // Skip OpenAI due to quota issues, go straight to Perplexity
    try {
      console.log('Attempting Perplexity API call');
      
      if (!process.env.PERPLEXITY_API_KEY) {
        throw new Error('Missing Perplexity API key');
      }
      
      // Properly format messages for Perplexity
      const perplexityResponse = await callPerplexityAPI(userMessage);
      console.log('Perplexity API call successful');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: perplexityResponse + "\n\n(Perplexity)",
          provider: 'perplexity'
        })
      };
    } catch (perplexityError) {
      console.error('Perplexity API error:', perplexityError.message);
      
      // Fall back to local response
      const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
      let fallbackResponse;
      
      if (hasTangkhulChars) {
        fallbackResponse = "Thank you for sharing that Tangkhul phrase. Could you tell me what it means in English?";
      } else if (['hi', 'hello', 'hey'].includes(normalizedMessage)) {
        fallbackResponse = "Hello! I'm interested in learning Tangkhul language examples. Could you share a phrase in Tangkhul with me?";
      } else {
        fallbackResponse = "Thank you for your message. I'd love to learn some Tangkhul phrases. Could you share a word or expression?";
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: fallbackResponse + "\n\n(Fallback - Perplexity Error: " + perplexityError.message + ")",
          provider: 'fallback',
          apiError: perplexityError.message
        })
      };
    }
  } catch (error) {
    console.error('Function error:', error.message);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: "I'm here to help collect Tangkhul language examples. Could you share a phrase or word in Tangkhul with me?\n\n(Error Recovery)",
        error: error.message
      })
    };
  }
};

async function callPerplexityAPI(userMessage) {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  
  if (!perplexityKey) {
    throw new Error('Missing Perplexity API key');
  }
  
  // Create properly formatted messages for Perplexity API
  // IMPORTANT: After system message, roles must alternate between user and assistant
  const messages = [
    {
      role: "system",
      content: "You are an AI assistant designed to collect Tangkhul language examples. Use only English in your responses. Ask only ONE question at a time. Keep responses concise and focused on collecting Tangkhul language examples."
    },
    {
      role: "user",
      content: userMessage
    }
  ];
  
  // If the user's message doesn't seem to be the first in a conversation,
  // Add a dummy assistant message before it to ensure proper alternation
  const isNewConversation = ['hi', 'hello', 'hey', 'greetings'].includes(userMessage.toLowerCase().trim());
  if (!isNewConversation) {
    messages.splice(1, 0, {
      role: "assistant",
      content: "Hello! I'd love to learn some Tangkhul phrases. Could you share a word or phrase in Tangkhul with me?"
    });
  }
  
  console.log('Perplexity messages:', JSON.stringify(messages));
  
  // Prepare request
  const requestBody = {
    model: "sonar",
    messages: messages,
    max_tokens: 300,
    temperature: 0.7
  };
  
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('Perplexity response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity error response:', errorText);
      throw new Error(`Perplexity API error: ${response.status}, ${errorText}`);
    }
    
    const data = await response.json();
    console.log('Perplexity response structure:', JSON.stringify(Object.keys(data)));
    
    if (!data.choices || !data.choices.length || !data.choices[0].message) {
      console.error('Unexpected Perplexity response format:', JSON.stringify(data));
      throw new Error('Unexpected response format from Perplexity API');
    }
    
    let aiResponse = data.choices[0].message.content;
    console.log('Raw Perplexity response:', aiResponse);
    
    // Remove thinking sections if present
    if (aiResponse.includes('<think>')) {
      aiResponse = aiResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      console.log('Response after removing thinking sections:', aiResponse);
      
      // If we end up with empty content after filtering, use the original
      if (!aiResponse) {
        console.log('Empty response after filtering, using original');
        aiResponse = data.choices[0].message.content;
      }
    }
    
    return aiResponse;
  } catch (error) {
    console.error('Error in Perplexity API call:', error);
    throw error;
  }
}
