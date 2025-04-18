const fetch = require('node-fetch');

// Store conversation histories in memory (will reset on function restart)
const conversationHistories = {};

// Common English words/phrases to ask for translations
const translationPrompts = [
  "How would you say 'hello' in Tangkhul?",
  "What's the Tangkhul word for 'thank you'?",
  "How do you say 'good morning' in Tangkhul?",
  "What do you call 'water' in Tangkhul?",
  "How would you translate 'friend' to Tangkhul?",
  "What's the Tangkhul word for 'family'?",
  "How do people say 'goodbye' in Tangkhul?",
  "What do you call 'food' in Tangkhul?",
  "How would you say 'I am happy' in Tangkhul?",
  "What's the word for 'house' in Tangkhul?",
  "How do you say 'beautiful' in Tangkhul?",
  "What's the Tangkhul term for 'village'?",
  "How would you translate 'rain' to Tangkhul?",
  "What do you call 'sun' in Tangkhul?",
  "How do you say 'love' in Tangkhul?"
];

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

// Function to detect likely incomplete messages
function isLikelyIncompleteMessage(message) {
  // Very short messages (1-2 words)
  const wordCount = message.split(/\s+/).length;
  
  // Common sentence starters that indicate more should be coming
  const commonStarters = ["we", "i", "they", "you", "he", "she", "it", "the", "this", "these", "those"];
  
  // Common filler words that suggest an incomplete thought
  const fillerWords = ["like", "so", "just", "very", "really", "basically", "actually"];
  
  // Check for messages that end with these words, suggesting more is coming
  const incompleteEndings = [...commonStarters, ...fillerWords, "and", "or", "but", "with", "for", "to", "by", "on", "in", "at", "from", "that", "use"];
  
  // Does the message end with a common incomplete ending?
  const lastWord = message.split(/\s+/).pop().replace(/[.,?!;:'"()]/, '');
  const endsWithIncompleteWord = incompleteEndings.includes(lastWord);
  
  // Missing ending punctuation for longer phrases
  const hasPunctuation = /[.?!]$/.test(message);
  const missingPunctuation = !hasPunctuation && wordCount > 1;
  
  // Does the message look like a partial sentence?
  return (wordCount <= 3 && endsWithIncompleteWord) || 
         (missingPunctuation && endsWithIncompleteWord) ||
         (message === "we use" || message === "we use." || message === "we used" || message === "we used.");
}

// Function to generate clarification responses
function getClarificationResponse(userMessage, conversationHistory) {
  // Get the most recent AI message (to understand context)
  const assistantMessages = conversationHistory.filter(msg => msg.role === "assistant");
  const lastAssistantMessage = assistantMessages.length > 0 ? 
    assistantMessages[assistantMessages.length - 1].content : "";
  
  // Reference the last question asked
  let clarificationResponses = [];
  
  // If the last message was asking about greetings
  if (lastAssistantMessage.toLowerCase().includes("greet") || 
      lastAssistantMessage.toLowerCase().includes("hello")) {
    clarificationResponses = [
      "Could you please share the complete greeting in Tangkhul language?",
      "I'd love to hear how people greet each other in Tangkhul. Could you share the complete phrase?",
      "What greeting words or phrases do people use in Tangkhul? Could you share the full expression?"
    ];
  } 
  // Generic clarifications based on user's partial response
  else {
    const lowercaseMessage = userMessage.toLowerCase().trim();
    
    if (lowercaseMessage.startsWith("we use") || lowercaseMessage === "we use" || lowercaseMessage === "we use.") {
      clarificationResponses = [
        "What exactly do you use in Tangkhul? Could you complete your thought?",
        "What phrase or word do you use? I'd love to learn the complete Tangkhul expression.",
        "Could you share the complete expression that you use in Tangkhul?"
      ];
    } else {
      clarificationResponses = [
        "Could you please complete your thought? I'm interested in learning the full phrase.",
        "I think your message might be incomplete. Could you share the complete thought or phrase?",
        "I'd like to hear more about what you were going to say. Could you share the complete phrase or thought?"
      ];
    }
  }
  
  // Return a random clarification response
  return clarificationResponses[Math.floor(Math.random() * clarificationResponses.length)];
}

// Function to get a random translation prompt based on category
function getRandomTranslationPrompt(category) {
  // Greeting category prompts
  const greetingPrompts = [
    "Nice to meet you! How would you say 'hello' in Tangkhul?",
    "Hello there! What's the Tangkhul word for 'greeting'?",
    "Hi! I'd love to know how to say 'good morning' in Tangkhul.",
    "Hello! How do people greet each other in Tangkhul?",
    "Hi there! Could you teach me how to say 'welcome' in Tangkhul?"
  ];
  
  // General category prompts (everyday objects and concepts)
  const generalPrompts = [
    "What do you call 'water' in Tangkhul?",
    "How would you say 'food' in Tangkhul language?",
    "What's the Tangkhul word for 'friend'?",
    "How do you say 'thank you' in Tangkhul?",
    "What do you call 'home' or 'house' in Tangkhul?",
    "How would you translate 'village' to Tangkhul?",
    "What's the Tangkhul term for 'family'?",
    "How do you say 'tree' in Tangkhul?",
    "What do people call the 'sun' in Tangkhul?",
    "How would you say 'beautiful' in Tangkhul?",
    "What's the Tangkhul word for 'love'?",
    "How do you say 'goodbye' in Tangkhul?"
  ];
  
  // Select appropriate category
  const promptList = category === "greeting" ? greetingPrompts : generalPrompts;
  
  // Return a random prompt from the selected category
  return promptList[Math.floor(Math.random() * promptList.length)];
}

// Create a translation-focused system message
function createSystemMessage() {
  return {
    role: "system",
    content: `You are a conversational AI assistant designed to collect Tangkhul language examples. Your purpose is to collect specific Tangkhul words and phrases by asking targeted translation questions.

IMPORTANT INSTRUCTIONS:
1. Focus on asking for specific translations: "How do you say X in Tangkhul?"
2. Ask about everyday objects, actions, greetings, or common phrases
3. Maintain a casual, friendly tone
4. Keep responses short (1-3 sentences)
5. If the user shares a Tangkhul word/phrase, ask what it means in English
6. If the user shares a meaning in English, thank them and ask for another specific translation
7. Move through different topics: greetings, food, family, nature, emotions, etc.
8. Ask one specific translation question at a time
9. Be alert for incomplete messages or sentences and ask for clarification
10. If a user message seems cut off, ask them to complete their thought rather than interpreting literally

Your goal is to collect precise vocabulary and phrases in Tangkhul through directed translation questions, while handling communication challenges gracefully.`
  };
}

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
        content: "How would you say 'hello' in Tangkhul?"
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
      content: "I'd like to share a Tangkhul word."
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
