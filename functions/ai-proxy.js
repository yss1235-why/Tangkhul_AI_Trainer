const fetch = require('node-fetch');
const path = require('path');

// Import the shared ChatContext utilities using a path that works in the functions directory
const ChatContextUtils = require('../src/shared/ChatContextUtils');

// Destructure the utilities we need
const {
  conversationHistories,
  translationPrompts,
  getRandomTranslationPrompt,
  isLikelyIncompleteMessage,
  getClarificationResponse,
  createSystemMessage,
  validateMessageSequence
} = ChatContextUtils;

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
    let conversationId = requestBody.conversationId || "default-" + Date.now();
    
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
      // Get a random translation prompt
      const randomPrompt = translationPrompts[Math.floor(Math.random() * translationPrompts.length)];
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: randomPrompt + "\n\n(Fallback System)",
          provider: 'fallback',
          conversationId: conversationId
        })
      };
    }
    
    // Initial language detection for better handling
    const normalizedMessage = userMessage.toLowerCase().trim();
    
    // Special handling for common English phrases
    const commonEnglishPhrases = {
      'hi': getRandomTranslationPrompt("greeting"),
      'hello': getRandomTranslationPrompt("greeting"),
      'hey': getRandomTranslationPrompt("greeting"),
      'okay': getRandomTranslationPrompt("general"),
      'ok': getRandomTranslationPrompt("general"),
      'sure': getRandomTranslationPrompt("general"),
      'yes': getRandomTranslationPrompt("general")
    };

    // Check if the message might be incomplete
    if (isLikelyIncompleteMessage(normalizedMessage)) {
      console.log('Detected likely incomplete message:', normalizedMessage);
      
      // Add to conversation history
      if (!conversationHistories[conversationId]) {
        conversationHistories[conversationId] = [
          createSystemMessage()
        ];
      }
      
      // Add user message to history
      conversationHistories[conversationId].push(
        { role: "user", content: userMessage }
      );
      
      // Generate a clarification response
      const clarificationResponse = getClarificationResponse(userMessage, conversationHistories[conversationId]);
      
      // Add assistant response to history
      conversationHistories[conversationId].push(
        { role: "assistant", content: clarificationResponse }
      );
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: clarificationResponse + "\n\n(Clarification)",
          provider: 'direct',
          conversationId: conversationId
        })
      };
    }
    
    // Check if message is a common English phrase that needs a direct response
    if (commonEnglishPhrases[normalizedMessage]) {
      const response = commonEnglishPhrases[normalizedMessage];
      
      // For direct responses, still maintain conversation history
      if (!conversationHistories[conversationId]) {
        conversationHistories[conversationId] = [
          createSystemMessage()
        ];
      }
      
      // Add user message and assistant response to history
      conversationHistories[conversationId].push(
        { role: "user", content: userMessage },
        { role: "assistant", content: response }
      );
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: response + "\n\n(Direct Response)",
          provider: 'direct',
          conversationId: conversationId
        })
      };
    }
    
    // Get or initialize conversation history
    if (!conversationHistories[conversationId]) {
      console.log('Creating new conversation history');
      conversationHistories[conversationId] = [
        createSystemMessage()
      ];
    }
    
    // Add the user message to the conversation history
    conversationHistories[conversationId].push({
      role: "user",
      content: userMessage
    });
    
    console.log('Current conversation history:', JSON.stringify(conversationHistories[conversationId]));
    
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
        fallbackResponse = getRandomTranslationPrompt("greeting");
      } else {
        // Default to asking about an everyday object or concept
        fallbackResponse = getRandomTranslationPrompt("general");
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
    
    // Default to a translation prompt if there's an error
    const randomPrompt = translationPrompts[Math.floor(Math.random() * translationPrompts.length)];
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: randomPrompt + "\n\n(Error Recovery)",
        error: error.message
      })
    };
  }
};

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
  
  console.log('Sending request to Perplexity');
  
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
