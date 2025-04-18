const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  console.log('=============== NEW REQUEST START ===============');
  console.log('Netlify Function Environment:', process.env.NODE_ENV);
  console.log('Node.js Version:', process.version);
  
  // Log available environment variables (without values for security)
  console.log('Available env vars:', Object.keys(process.env).join(', '));
  console.log('Has OpenAI key:', !!process.env.OPENAI_API_KEY);
  console.log('OpenAI key length:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);
  console.log('Has Perplexity key:', !!process.env.PERPLEXITY_API_KEY);
  console.log('Perplexity key length:', process.env.PERPLEXITY_API_KEY ? process.env.PERPLEXITY_API_KEY.length : 0);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  console.log('Request received, HTTP Method:', event.httpMethod);
  console.log('Request headers:', JSON.stringify(event.headers));

  try {
    // Log raw event for debugging
    console.log('Raw event body (first 500 chars):', event.body.substring(0, 500));
    
    // Parse request body
    const requestBody = JSON.parse(event.body);
    console.log('Parsed request body keys:', Object.keys(requestBody));
    
    // Extract message data
    let userMessage = "";
    let messagesArray = [];
    
    // Try to extract message from various possible structures
    if (requestBody.messages && Array.isArray(requestBody.messages)) {
      messagesArray = requestBody.messages;
      console.log('Messages array length:', messagesArray.length);
      
      const userMessages = messagesArray.filter(msg => msg.role === "user");
      console.log('User messages found:', userMessages.length);
      
      if (userMessages.length > 0) {
        userMessage = userMessages[userMessages.length - 1].content;
      }
    } else if (requestBody.message) {
      userMessage = requestBody.message;
      console.log('Direct message found');
      
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
          response: "I'd like to learn some Tangkhul phrases. Could you share a word or sentence in Tangkhul with me?\n\n(Fallback System - No message extracted)",
          provider: 'fallback'
        })
      };
    }
    
    // Initial language detection for better handling
    const normalizedMessage = userMessage.toLowerCase().trim();
    console.log('Normalized message:', normalizedMessage);
    
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
    console.log('Is common English word:', isCommonEnglish);
    
    // Special handling for "okay" and its variants
    const isOkay = ['okay', 'ok', 'k', 'kk', 'alright', 'alrighty', 'sure'].includes(normalizedMessage);
    console.log('Is "okay" variant:', isOkay);
    
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
      console.log('----- ATTEMPTING OPENAI API CALL -----');
      console.log('OpenAI API URL: https://api.openai.com/v1/chat/completions');
      
      // Validate OpenAI key before attempting call
      if (!process.env.OPENAI_API_KEY) {
        console.error('ERROR: Missing OpenAI API key - key is undefined or empty');
        throw new Error('Missing OpenAI API key');
      }
      
      // Check for valid key format (without revealing the actual key)
      if (!/^sk-[A-Za-z0-9]{48,}$/.test(process.env.OPENAI_API_KEY)) {
        console.error('ERROR: OpenAI API key appears to be in incorrect format');
        throw new Error('Invalid OpenAI API key format');
      }
      
      console.log('OpenAI API key validation passed');
      
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
      console.error('----- OPENAI API ERROR DETAILS -----');
      console.error('Error message:', openaiError.message);
      console.error('Error stack:', openaiError.stack);
      console.error('Error name:', openaiError.name);
      console.error('Error code:', openaiError.code);
      
      // Try Perplexity as fallback
      try {
        console.log('----- ATTEMPTING PERPLEXITY API CALL -----');
        console.log('Perplexity API URL: https://api.perplexity.ai/chat/completions');
        
        // Validate Perplexity key before attempting call
        if (!process.env.PERPLEXITY_API_KEY) {
          console.error('ERROR: Missing Perplexity API key - key is undefined or empty');
          throw new Error('Missing Perplexity API key');
        }
        
        // Log first few characters of key for debugging (securely)
        const keyFirstChars = process.env.PERPLEXITY_API_KEY.substring(0, 3);
        const keyLastChars = process.env.PERPLEXITY_API_KEY.slice(-3);
        console.log(`Perplexity API key starts with "${keyFirstChars}..." and ends with "...${keyLastChars}"`);
        
        console.log('Attempting Perplexity API with messages array length:', messagesArray.length);
        
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
        console.error('----- PERPLEXITY API ERROR DETAILS -----');
        console.error('Error message:', perplexityError.message);
        console.error('Error stack:', perplexityError.stack);
        console.error('Error name:', perplexityError.name);
        console.error('Error code:', perplexityError.code);
        
        // If both APIs fail, provide a fallback response based on message content
        console.log('----- BOTH APIs FAILED, USING FALLBACK -----');
        
        // Simple language detection
        const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
        console.log('Has Tangkhul special characters:', hasTangkhulChars);
        
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
          
          console.log('English word count in message:', englishWordCount, 'out of', messageWords.length, 'total words');
          
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
    console.error('----- FUNCTION-LEVEL ERROR -----');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Error code:', error.code);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: "I'm here to help collect Tangkhul language examples. Could you share a phrase or word in Tangkhul with me?\n\n(Error Recovery - " + error.message.substring(0, 50) + "...)",
        error: error.message,
        stack: error.stack
      })
    };
  } finally {
    console.log('=============== REQUEST END ===============');
  }
};

async function callOpenAIAPI(userMessage, isLikelyEnglish) {
  console.log('callOpenAIAPI function started');
  
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiKey) {
    console.error('Missing OpenAI API key in function');
    throw new Error('Missing OpenAI API key');
  }
  
  console.log('OpenAI API key validation passed in function');
  
  // Detect language features
  const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
  const normalizedMessage = userMessage.toLowerCase().trim();
  const isGreeting = ['hi', 'hello', 'hey', 'greetings'].includes(normalizedMessage);
  
  console.log('Message analysis - Tangkhul chars:', hasTangkhulChars, 'Is greeting:', isGreeting, 'Is likely English:', isLikelyEnglish);
  
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
  
  console.log('OpenAI messages prepared:', JSON.stringify(messages));
  
  // Prepare the request for OpenAI
  const requestBody = {
    model: 'gpt-3.5-turbo',
    messages: messages,
    max_tokens: 150,
    temperature: 0.7
  };
  
  console.log('OpenAI request body prepared:', JSON.stringify(requestBody));
  
  try {
    console.log('Sending fetch request to OpenAI API');
    
    const startTime = Date.now();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    const endTime = Date.now();
    
    console.log(`OpenAI API response received in ${endTime - startTime}ms`);
    console.log('OpenAI response status:', response.status);
    console.log('OpenAI response headers:', JSON.stringify(response.headers.raw()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI error response body:', errorText);
      throw new Error(`OpenAI API error: ${response.status}, ${errorText}`);
    }
    
    const data = await response.json();
    console.log('OpenAI response data keys:', Object.keys(data));
    console.log('OpenAI choices length:', data.choices ? data.choices.length : 0);
    
    if (!data.choices || !data.choices.length || !data.choices[0].message) {
      console.error('Unexpected OpenAI response format:', JSON.stringify(data));
      throw new Error('Unexpected response format from OpenAI API');
    }
    
    const aiResponse = data.choices[0].message.content.trim();
    console.log('OpenAI response content (first 100 chars):', aiResponse.substring(0, 100));
    
    return aiResponse;
  } catch (error) {
    console.error('Error in OpenAI API call function:', error);
    console.error('Error stack:', error.stack);
    
    // Enhance error with more details for debugging
    const enhancedError = new Error(`OpenAI API error: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.stack = error.stack;
    throw enhancedError;
  }
}

async function callPerplexityAPI(messages, isLikelyEnglish) {
  console.log('callPerplexityAPI function started');
  
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  
  if (!perplexityKey) {
    console.error('Missing Perplexity API key in function');
    throw new Error('Missing Perplexity API key');
  }
  
  console.log('Perplexity API key validation passed in function');
  
  // Find if there's a user message and what it is
  let userMessage = "";
  const userMessages = messages.filter(msg => msg.role === "user");
  if (userMessages.length > 0) {
    userMessage = userMessages[userMessages.length - 1].content;
    console.log('Last user message found:', userMessage);
  }
  
  // Find system message index
  const systemIndex = messages.findIndex(msg => msg.role === "system");
  console.log('System message index:', systemIndex);
  
  // If there's a system message, update it with language detection info
  if (systemIndex >= 0 && userMessage) {
    const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
    console.log('Updating system message with language detection. Has Tangkhul chars:', hasTangkhulChars);
    
    if (hasTangkhulChars) {
      messages[systemIndex].content += " The user has sent what appears to be a Tangkhul phrase. Ask what it means in English.";
    } else if (isLikelyEnglish) {
      messages[systemIndex].content += " The user has sent a message in English. Ask them to share a phrase in Tangkhul.";
    }
  } else if (userMessage) {
    // If no system message but we have a user message, add a system message
    console.log('No system message found, adding one');
    
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
  
  console.log('Perplexity messages prepared, count:', messages.length);
  
  // Prepare request body following Perplexity's format
  const requestBody = {
    model: "sonar", // Using the model from your example
    messages: messages,
    max_tokens: 150,
    temperature: 0.7,
    top_p: 0.9,
    search_domain_filter: ["<any>"],
    return_images: false,
    return_related_questions: false,
    stream: false,
    presence_penalty: 0,
    frequency_penalty: 0
  };
  
  console.log('Perplexity request body prepared');
  
  try {
    console.log('Sending fetch request to Perplexity API');
    
    const startTime = Date.now();
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    const endTime = Date.now();
    
    console.log(`Perplexity API response received in ${endTime - startTime}ms`);
    console.log('Perplexity response status:', response.status);
    console.log('Perplexity response headers:', JSON.stringify(response.headers.raw()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity error response body:', errorText);
      throw new Error(`Perplexity API error: ${response.status}, ${errorText}`);
    }
    
    const data = await response.json();
    console.log('Perplexity response data keys:', Object.keys(data));
    console.log('Perplexity choices length:', data.choices ? data.choices.length : 0);
    
    if (!data.choices || !data.choices.length || !data.choices[0].message) {
      console.error('Unexpected Perplexity response format:', JSON.stringify(data));
      throw new Error('Unexpected response format from Perplexity API');
    }
    
    let aiResponse = data.choices[0].message.content;
    console.log('Perplexity response content (first 100 chars):', aiResponse.substring(0, 100));
    
    // Remove thinking sections if present
    aiResponse = aiResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    return aiResponse;
  } catch (error) {
    console.error('Error in Perplexity API call function:', error);
    console.error('Error stack:', error.stack);
    
    // Enhance error with more details for debugging
    const enhancedError = new Error(`Perplexity API error: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.stack = error.stack;
    throw enhancedError;
  }
}
