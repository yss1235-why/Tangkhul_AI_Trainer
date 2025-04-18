const fetch = require('node-fetch');

// Simple rate limiting map to track API calls
const rateLimitMap = {
  lastOpenAICall: 0,
  lastPerplexityCall: 0
};

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
    
    // Try to call APIs with retries and proper rate limiting
    try {
      // First try Perplexity (switching the order since OpenAI has rate limit issues)
      try {
        console.log('Attempting Perplexity API call');
        
        if (!process.env.PERPLEXITY_API_KEY) {
          throw new Error('Missing Perplexity API key');
        }
        
        // Check rate limiting for Perplexity - ensure at least 2 seconds between calls
        const now = Date.now();
        const timeSinceLastCall = now - rateLimitMap.lastPerplexityCall;
        
        if (timeSinceLastCall < 2000) {
          // Wait if needed to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 2000 - timeSinceLastCall));
        }
        
        // Update last call time
        rateLimitMap.lastPerplexityCall = Date.now();
        
        const perplexityResponse = await callPerplexityAPI(messagesArray);
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
        
        // Try OpenAI as backup, with rate limiting
        console.log('Attempting OpenAI API call');
        
        if (!process.env.OPENAI_API_KEY) {
          throw new Error('Missing OpenAI API key');
        }
        
        // Check rate limiting for OpenAI - ensure at least 3 seconds between calls
        // (OpenAI has stricter rate limits)
        const now = Date.now();
        const timeSinceLastCall = now - rateLimitMap.lastOpenAICall;
        
        if (timeSinceLastCall < 3000) {
          // Wait if needed to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 3000 - timeSinceLastCall));
        }
        
        // Update last call time
        rateLimitMap.lastOpenAICall = Date.now();
        
        const aiResponse = await callOpenAIAPI(userMessage);
        console.log('OpenAI API call successful');
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            response: aiResponse + "\n\n(OpenAI)",
            provider: 'openai'
          })
        };
      }
    } catch (error) {
      console.error('All API calls failed:', error.message);
      
      // If both APIs fail, provide a simple language-based response
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
          response: fallbackResponse + "\n\n(API Error - Please check your API keys)",
          provider: 'fallback',
          apiError: error.message
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

async function callOpenAIAPI(userMessage) {
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiKey) {
    throw new Error('Missing OpenAI API key');
  }
  
  // Detect language features for customizing prompts
  const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
  const normalizedMessage = userMessage.toLowerCase().trim();
  const isGreeting = ['hi', 'hello', 'hey', 'greetings'].includes(normalizedMessage);
  
  // Prepare system message based on content analysis
  let systemContent;
  if (hasTangkhulChars) {
    systemContent = "You are an AI assistant collecting Tangkhul language examples. The user has sent what appears to be a Tangkhul phrase. Ask them politely what it means in English.";
  } else if (isGreeting) {
    systemContent = "You are an AI assistant collecting Tangkhul language examples. The user has greeted you. Welcome them warmly and ask them to share a Tangkhul phrase or word with you.";
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
  
  // Use a more efficient model to reduce costs and rate limits
  const model = "gpt-3.5-turbo-instruct";
  
  try {
    // Implement retry logic with exponential backoff
    let retries = 0;
    const maxRetries = 2;
    
    while (retries <= maxRetries) {
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
            max_tokens: 300,  // Reduced to save on tokens
            temperature: 0.7
          })
        });
        
        if (response.status === 429) {
          // Rate limit hit, apply exponential backoff
          const waitTime = Math.pow(2, retries) * 1000;
          console.log(`Rate limit hit, waiting ${waitTime}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retries++;
          continue;
        }
        
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
        if (retries >= maxRetries || error.message.includes('API key')) {
          throw error;
        }
        retries++;
      }
    }
  } catch (error) {
    throw error;
  }
}

async function callPerplexityAPI(messages) {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  
  if (!perplexityKey) {
    throw new Error('Missing Perplexity API key');
  }
  
  // Ensure messages are in the correct format
  const formattedMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
  
  // Ensure we have a system message
  if (!formattedMessages.some(msg => msg.role === 'system')) {
    formattedMessages.unshift({
      role: 'system',
      content: 'You are an AI assistant designed to collect Tangkhul language examples. Use only English in your responses. Ask only ONE question at a time.'
    });
  }
  
  // Simplified request for Perplexity - only using required parameters
  const requestBody = {
    model: "sonar",
    messages: formattedMessages,
    max_tokens: 300
  };
  
  try {
    // Implement retry logic with exponential backoff
    let retries = 0;
    const maxRetries = 2;
    
    while (retries <= maxRetries) {
      try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${perplexityKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });
        
        if (response.status === 429) {
          // Rate limit hit, apply exponential backoff
          const waitTime = Math.pow(2, retries) * 1000;
          console.log(`Rate limit hit, waiting ${waitTime}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retries++;
          continue;
        }
        
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
        if (retries >= maxRetries || error.message.includes('API key')) {
          throw error;
        }
        retries++;
      }
    }
  } catch (error) {
    throw error;
  }
}
