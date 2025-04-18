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
    
    // Try to call OpenAI first
    try {
      console.log('Attempting OpenAI API call');
      
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('Missing OpenAI API key');
      }
      
      // Check rate limiting for OpenAI
      const now = Date.now();
      const timeSinceLastCall = now - rateLimitMap.lastOpenAICall;
      
      if (timeSinceLastCall < 3000) {
        // Wait if needed to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 3000 - timeSinceLastCall));
      }
      
      // Update last call time
      rateLimitMap.lastOpenAICall = Date.now();
      
      const aiResponse = await callOpenAIAPI(userMessage);
      console.log('OpenAI API call successful, response:', aiResponse);
      
      if (!aiResponse) {
        throw new Error('Empty response from OpenAI');
      }
      
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
          throw new Error('Missing Perplexity API key');
        }
        
        // Check rate limiting for Perplexity
        const now = Date.now();
        const timeSinceLastCall = now - rateLimitMap.lastPerplexityCall;
        
        if (timeSinceLastCall < 2000) {
          // Wait if needed to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 2000 - timeSinceLastCall));
        }
        
        // Update last call time
        rateLimitMap.lastPerplexityCall = Date.now();
        
        const perplexityResponse = await callPerplexityAPI(messagesArray);
        console.log('Perplexity API call successful, response:', perplexityResponse);
        
        if (!perplexityResponse) {
          throw new Error('Empty response from Perplexity');
        }
        
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
            response: fallbackResponse + "\n\n(API Error - " + 
                     "OpenAI: " + openaiError.message + ", " +
                     "Perplexity: " + perplexityError.message + ")",
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
        response: "I'm here to help collect Tangkhul language examples. Could you share a phrase or word in Tangkhul with me?\n\n(Error Recovery - " + error.message + ")",
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
  
  try {
    console.log('Sending request to OpenAI with messages:', JSON.stringify(messages));
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: messages,
        max_tokens: 300,
        temperature: 0.7
      })
    });
    
    console.log('OpenAI response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI error response:', errorText);
      throw new Error(`OpenAI API error: ${response.status}, ${errorText}`);
    }
    
    const data = await response.json();
    console.log('OpenAI response structure:', JSON.stringify(Object.keys(data)));
    
    if (data.choices && data.choices.length > 0) {
      console.log('OpenAI choices structure:', JSON.stringify(Object.keys(data.choices[0])));
      
      // Check for both formats - chat completions and completions
      if (data.choices[0].message && data.choices[0].message.content) {
        // Chat completions format
        return data.choices[0].message.content.trim();
      } else if (data.choices[0].text) {
        // Completions format
        return data.choices[0].text.trim();
      } else {
        console.error('Unknown OpenAI response format:', JSON.stringify(data.choices[0]));
        throw new Error('Unexpected response format from OpenAI API');
      }
    } else {
      console.error('No choices in OpenAI response:', JSON.stringify(data));
      throw new Error('No completion choices returned from OpenAI');
    }
  } catch (error) {
    console.error('Error in OpenAI API call:', error);
    throw error;
  }
}

async function callPerplexityAPI(messages) {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  
  if (!perplexityKey) {
    throw new Error('Missing Perplexity API key');
  }
  
  // Make sure we have a proper messages array
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Invalid messages array for Perplexity API');
  }
  
  // Find the user message for debugging
  const userMessage = messages.find(msg => msg.role === 'user')?.content || '';
  console.log('User message being sent to Perplexity:', userMessage);
  
  // Ensure all messages have proper structure
  const validMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
  
  // Make sure we have a system message
  if (!validMessages.some(msg => msg.role === 'system')) {
    validMessages.unshift({
      role: 'system',
      content: 'You are an AI assistant designed to collect Tangkhul language examples. Use only English in your responses. Ask only ONE question at a time.'
    });
  }
  
  // Simplified request for Perplexity - only using required parameters
  const requestBody = {
    model: "sonar",
    messages: validMessages,
    max_tokens: 300
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
    console.log('Perplexity response structure:', JSON.stringify(Object.keys(data)));
    
    if (data.choices && data.choices.length > 0) {
      console.log('Perplexity choices structure:', JSON.stringify(Object.keys(data.choices[0])));
      
      // Check for proper response format
      if (data.choices[0].message && data.choices[0].message.content) {
        let aiResponse = data.choices[0].message.content;
        
        // Log the full response before any processing
        console.log('Raw Perplexity response:', aiResponse);
        
        // First check if there are thinking sections to remove
        if (aiResponse.includes('<think>')) {
          console.log('Detected thinking sections, removing them');
          aiResponse = aiResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
          console.log('Response after removing thinking sections:', aiResponse);
        }
        
        // If after removing thinking sections we have nothing left, use the original response
        if (!aiResponse) {
          console.log('Empty response after removing thinking sections, using original');
          aiResponse = data.choices[0].message.content.trim();
        }
        
        return aiResponse;
      } else {
        console.error('Unknown Perplexity response format:', JSON.stringify(data.choices[0]));
        throw new Error('Unexpected response format from Perplexity API');
      }
    } else {
      console.error('No choices in Perplexity response:', JSON.stringify(data));
      throw new Error('No completion choices returned from Perplexity');
    }
  } catch (error) {
    console.error('Error in Perplexity API call:', error);
    throw error;
  }
}
