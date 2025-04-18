const fetch = require('node-fetch');

// Store conversation histories in memory (will reset on function restart)
// In production, you'd use a persistent store like Firebase, DynamoDB, etc.
const conversationHistories = {};

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
    
    // Extract message data and conversation ID
    let userMessage = "";
    let conversationId = requestBody.conversationId || "default";
    
    console.log('Conversation ID:', conversationId);
    
    // Try to extract message from various possible structures
    if (requestBody.messages && Array.isArray(requestBody.messages)) {
      const userMessages = requestBody.messages.filter(msg => msg.role === "user");
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
    
    // Get or initialize conversation history
    if (!conversationHistories[conversationId]) {
      console.log('Creating new conversation history');
      conversationHistories[conversationId] = [
        {
          role: "system",
          content: "You are an AI assistant designed to collect Tangkhul language examples. Use only English in your responses. Ask only ONE question at a time. Keep responses concise and focused on collecting Tangkhul language examples."
        }
      ];
    }
    
    // Add the user message to the conversation history
    conversationHistories[conversationId].push({
      role: "user",
      content: userMessage
    });
    
    console.log('Current conversation history:', JSON.stringify(conversationHistories[conversationId]));
    
    // Initial language detection for better handling
    const normalizedMessage = userMessage.toLowerCase().trim();
    
    // Special handling for "okay" and its variants
    const isOkay = ['okay', 'ok', 'k', 'kk', 'alright', 'alrighty', 'sure'].includes(normalizedMessage);
    
    if (isOkay) {
      const response = "Great! I'd love to learn some Tangkhul phrases. Could you teach me a word or phrase in Tangkhul language?\n\n(Direct Response)";
      
      // Add assistant response to history
      conversationHistories[conversationId].push({
        role: "assistant",
        content: response.split('\n\n')[0] // Store without the provider tag
      });
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: response,
          provider: 'direct',
          conversationId: conversationId
        })
      };
    }
    
    // Try Perplexity with the full conversation history
    try {
      console.log('Attempting Perplexity API call');
      
      if (!process.env.PERPLEXITY_API_KEY) {
        throw new Error('Missing Perplexity API key');
      }
      
      // Make sure our history follows the alternating pattern rule
      const validatedHistory = validateMessageSequence(conversationHistories[conversationId]);
      
      // Call Perplexity with the validated history
      const perplexityResponse = await callPerplexityAPI(validatedHistory);
      console.log('Perplexity API call successful');
      
      // Add the assistant response to the conversation history
      conversationHistories[conversationId].push({
        role: "assistant",
        content: perplexityResponse // Store without the provider tag
      });
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: perplexityResponse + "\n\n(Perplexity)",
          provider: 'perplexity',
          conversationId: conversationId
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
      
      // Add the fallback response to history
      conversationHistories[conversationId].push({
        role: "assistant",
        content: fallbackResponse // Store without the provider tag
      });
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: fallbackResponse + "\n\n(Fallback - API Error: " + perplexityError.message + ")",
          provider: 'fallback',
          conversationId: conversationId,
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

// Function to ensure messages follow the required alternating pattern
function validateMessageSequence(messages) {
  // Clone the messages to avoid modifying the original
  const result = [...messages];
  
  // Find the index of the first non-system message
  const firstNonSystemIndex = result.findIndex(msg => msg.role !== 'system');
  
  // If there are no non-system messages, just return
  if (firstNonSystemIndex === -1) {
    return result;
  }
  
  // Ensure the first non-system message is a user message
  if (result[firstNonSystemIndex].role !== 'user') {
    // Insert a dummy user message if needed
    result.splice(firstNonSystemIndex, 0, {
      role: 'user',
      content: 'Hi'
    });
  }
  
  // Now check the alternation pattern after system messages
  for (let i = firstNonSystemIndex; i < result.length - 1; i++) {
    const currentRole = result[i].role;
    const nextRole = result[i + 1].role;
    
    // If current is user, next should be assistant
    if (currentRole === 'user' && nextRole !== 'assistant') {
      // Insert a dummy assistant message
      result.splice(i + 1, 0, {
        role: 'assistant',
        content: "I'd like to learn more about Tangkhul language."
      });
      i++; // Skip the inserted message in next iteration
    }
    // If current is assistant, next should be user
    else if (currentRole === 'assistant' && nextRole !== 'user') {
      // This shouldn't happen in our flow, but handle it anyway
      result.splice(i + 1, 0, {
        role: 'user',
        content: "Let me share a Tangkhul phrase."
      });
      i++; // Skip the inserted message in next iteration
    }
  }
  
  // Ensure we end with alternating pattern
  const lastMsg = result[result.length - 1];
  if (lastMsg.role === 'assistant') {
    // This shouldn't happen in our use case, but handle it
    result.push({
      role: 'user',
      content: "Please tell me more about Tangkhul."
    });
  }
  
  console.log('Validated message sequence:', JSON.stringify(result));
  return result;
}

async function callPerplexityAPI(messages) {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  
  if (!perplexityKey) {
    throw new Error('Missing Perplexity API key');
  }
  
  // Prepare request
  const requestBody = {
    model: "sonar",
    messages: messages,
    max_tokens: 300,
    temperature: 0.7
  };
  
  console.log('Sending request to Perplexity:', JSON.stringify(requestBody));
  
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
    
    if (!data.choices || !data.choices.length || !data.choices[0].message) {
      console.error('Unexpected Perplexity response format:', JSON.stringify(data));
      throw new Error('Unexpected response format from Perplexity API');
    }
    
    let aiResponse = data.choices[0].message.content;
    
    // Remove thinking sections if present
    if (aiResponse.includes('<think>')) {
      const filteredResponse = aiResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      // Only use filtered response if it's not empty
      if (filteredResponse) {
        aiResponse = filteredResponse;
      }
    }
    
    return aiResponse;
  } catch (error) {
    console.error('Error in Perplexity API call:', error);
    throw error;
  }
}
