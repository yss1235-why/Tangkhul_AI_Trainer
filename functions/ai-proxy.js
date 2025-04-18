const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  console.log('=============== NEW REQUEST START ===============');
  console.log('Has OpenAI key:', !!process.env.OPENAI_API_KEY);
  console.log('Has Perplexity key:', !!process.env.PERPLEXITY_API_KEY);
  
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
      messagesArray = [
        {
          role: "system",
          content: "You are an AI assistant designed to collect Tangkhul language examples. Use only English in your responses. Ask only ONE question at a time."
        },
        {
          role: "user",
          content: userMessage
        }
      ];
    }
    
    console.log('Extracted user message:', userMessage);
    
    if (!userMessage) {
      console.log('No message text could be extracted, using fallback');
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
    
    // Comprehensive list of common English words and phrases
    const commonEnglishWords = [
      'hi', 'hello', 'hey', 'yes', 'no', 'thanks', 'thank', 'you', 'okay', 'ok', 'sure', 
      'good', 'bad', 'nice', 'great', 'cool', 'awesome', 'fine', 'well', 'alright', 'right',
      'wrong', 'true', 'false', 'maybe', 'perhaps', 'definitely', 'certainly', 'exactly',
      'how', 'what', 'when', 'where', 'why', 'who', 'which', 'whose', 'whom',
      'is', 'are', 'am', 'was', 'were', 'be', 'being', 'been', 'have', 'has', 'had',
      'do', 'does', 'did', 'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might',
      'must', 'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'so'
    ];
    
    // Check if it's a common English word or phrase
    const isCommonEnglish = commonEnglishWords.includes(normalizedMessage) || 
                           commonEnglishWords.includes(normalizedMessage.replace(/[.,?!]$/, ''));
    
    // Special handling for "okay" and its variants
    const isOkay = ['okay', 'ok', 'k', 'kk', 'alright', 'alrighty', 'sure'].includes(normalizedMessage);
    
    if (isOkay) {
      console.log('Using direct response for "okay" variant');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: "Great! I'd love to learn some Tangkhul phrases. Could you teach me a word or phrase in Tangkhul language?\n\n(Direct Response)",
          provider: 'direct'
        })
      };
    }
    
    // Handle API calls with try-catch for each provider
    try {
      console.log('Attempting OpenAI API call');
      
      if (!process.env.OPENAI_API_KEY) {
        console.error('ERROR: Missing OpenAI API key');
        throw new Error('Missing OpenAI API key');
      }
      
      const aiResponse = await callOpenAIAPI(userMessage, isCommonEnglish);
      console.log('OpenAI API call successful');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: aiResponse + "\n\n(OpenAI)",
          provider: 'openai'
        })
      };
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError.message);
      
      // Try Perplexity as fallback
      try {
        console.log('Attempting Perplexity API call');
        
        if (!process.env.PERPLEXITY_API_KEY) {
          console.error('ERROR: Missing Perplexity API key');
          throw new Error('Missing Perplexity API key');
        }
        
        const perplexityResponse = await callPerplexityAPI(messagesArray, isCommonEnglish);
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
        
        // If both APIs fail, provide a fallback response based on message content
        // Simple language detection
        const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
        
        let fallbackResponse;
        if (hasTangkhulChars) {
          fallbackResponse = "Thank you for sharing that Tangkhul phrase. Could you tell me what it means in English?";
        } else if (isCommonEnglish) {
          fallbackResponse = "I'd like to learn some Tangkhul phrases. Could you teach me a word or phrase in Tangkhul?";
        } else {
          // Count how many English words are in the message
          let englishWordCount = 0;
          const messageWords = normalizedMessage.split(/\s+/);
          
          messageWords.forEach(word => {
            const cleanWord = word.replace(/[.,?!;:'"()]/, '');
            if (commonEnglishWords.includes(cleanWord)) {
              englishWordCount++;
            }
          });
          
          // If multiple English words detected, treat as English
          if (englishWordCount >= 2 || messageWords.length >= 4) {
            fallbackResponse = "Thank you for sharing. Could you teach me how to say something similar in Tangkhul language?";
          } else {
            fallbackResponse = "Is that a Tangkhul word or phrase? Could you tell me what it means in English?";
          }
        }
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            response: fallbackResponse + "\n\n(Fallback System - API Errors: " + 
                     "OpenAI: " + openaiError.message.substring(0, 50) + "..., " +
                     "Perplexity: " + perplexityError.message.substring(0, 50) + "...)",
            provider: 'fallback',
            apiErrors: {
              openai: openaiError.message,
              perplexity: perplexityError.message
            }
          })
        };
      }
    }
  } catch (error) {
    console.error('Function error:', error.message);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: "I'm here to help collect Tangkhul language examples. Could you share a phrase or word in Tangkhul with me?\n\n(Error Recovery - " + error.message.substring(0, 50) + "...)",
        error: error.message
      })
    };
  }
};

async function callOpenAIAPI(userMessage, isLikelyEnglish) {
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiKey) {
    throw new Error('Missing OpenAI API key');
  }
  
  // Detect language features
  const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
  const normalizedMessage = userMessage.toLowerCase().trim();
  const isGreeting = ['hi', 'hello', 'hey', 'greetings'].includes(normalizedMessage);
  
  // Prepare system message based on content analysis
  let systemContent;
  if (hasTangkhulChars) {
    systemContent = "You are an AI assistant collecting Tangkhul language examples. The user has sent what appears to be a Tangkhul phrase. Ask them politely what it means in English.";
  } else if (isGreeting) {
    systemContent = "You are an AI assistant collecting Tangkhul language examples. The user has greeted you. Welcome them warmly and ask them to share a Tangkhul phrase or word with you.";
  } else if (isLikelyEnglish) {
    systemContent = "You are an AI assistant collecting Tangkhul language examples. The user has sent a message in English. Respond appropriately and ask them to share a phrase or word in Tangkhul language.";
  } else {
    systemContent = "You are an AI assistant collecting Tangkhul language examples. Use only English in your responses. Ask only ONE question at a time. If the user message is in Tangkhul, ask what it means. If it's in English, ask for a Tangkhul phrase related to the topic.";
  }
  
  // Prepare messages for the API call
  const messages = [
    {
      role: "system",
      content: systemContent
    },
    {
      role: "user",
      content: userMessage
    }
  ];
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: messages,
        max_tokens: 500,  // Increased to 500 as requested
        temperature: 0.7
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status}, ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.choices || !data.choices.length || !data.choices[0].message) {
      throw new Error('Unexpected response format from OpenAI API');
    }
    
    return data.choices[0].message.content.trim();
  } catch (error) {
    throw error;
  }
}

async function callPerplexityAPI(messages, isLikelyEnglish) {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  
  if (!perplexityKey) {
    throw new Error('Missing Perplexity API key');
  }
  
  // Find if there's a user message and what it is
  let userMessage = "";
  const userMessages = messages.filter(msg => msg.role === "user");
  if (userMessages.length > 0) {
    userMessage = userMessages[userMessages.length - 1].content;
  }
  
  // Find system message index
  const systemIndex = messages.findIndex(msg => msg.role === "system");
  
  // If there's a system message, update it with language detection info
  if (systemIndex >= 0 && userMessage) {
    const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
    
    if (hasTangkhulChars) {
      messages[systemIndex].content += " The user has sent what appears to be a Tangkhul phrase. Ask what it means in English.";
    } else if (isLikelyEnglish) {
      messages[systemIndex].content += " The user has sent a message in English. Ask them to share a phrase in Tangkhul.";
    }
  } else if (userMessage) {
    // If no system message but we have a user message, add a system message
    const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
    let systemContent = "You are an AI assistant designed to collect Tangkhul language examples. Use only English in your responses. Ask only ONE question at a time.";
    
    if (hasTangkhulChars) {
      systemContent += " The user has sent what appears to be a Tangkhul phrase. Ask what it means in English.";
    } else if (isLikelyEnglish) {
      systemContent += " The user has sent a message in English. Ask them to share a phrase in Tangkhul.";
    }
    
    messages.unshift({
      role: "system",
      content: systemContent
    });
  }
  
  // Ensure all messages have proper structure
  const validMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
  
  // Prepare request body with simplified format for Perplexity
  const requestBody = {
    model: "sonar",
    messages: validMessages,
    max_tokens: 500,  // Increased to 500 as requested
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
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Perplexity API error: ${response.status}, ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.choices || !data.choices.length || !data.choices[0].message) {
      throw new Error('Unexpected response format from Perplexity API');
    }
    
    let aiResponse = data.choices[0].message.content;
    
    // Remove thinking sections if present
    aiResponse = aiResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    return aiResponse;
  } catch (error) {
    throw error;
  }
}
