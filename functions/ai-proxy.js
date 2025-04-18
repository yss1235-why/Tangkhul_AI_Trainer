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
    // Log raw event for debugging
    console.log('Raw event body:', event.body);
    
    // Parse request body
    const requestBody = JSON.parse(event.body);
    console.log('Parsed request body:', JSON.stringify(requestBody));
    
    // Extract message data
    let messageText = "";
    
    // Try to extract message from various possible structures
    if (requestBody.messages && Array.isArray(requestBody.messages)) {
      const userMessages = requestBody.messages.filter(msg => msg.role === "user");
      if (userMessages.length > 0) {
        messageText = userMessages[userMessages.length - 1].content;
      }
    } else if (requestBody.message) {
      messageText = requestBody.message;
    } else if (typeof requestBody === 'string') {
      messageText = requestBody;
    }
    
    console.log('Extracted message text:', messageText);
    
    if (!messageText) {
      console.log('No message text could be extracted, using default');
      messageText = "Hello";
    }
    
    // Handle API calls with try-catch for each provider
    try {
      console.log('Attempting OpenAI API call');
      const aiResponse = await callOpenAIAPI(messageText);
      console.log('OpenAI API call successful');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          response: aiResponse,
          provider: 'openai'
        })
      };
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      
      // Try Perplexity as fallback
      try {
        console.log('Attempting Perplexity API call');
        
        // Prepare messages for Perplexity
        const messages = [
          {
            role: "system",
            content: "You are an AI assistant designed to collect Tangkhul language examples. Use only English in your responses. Ask only ONE question at a time. Focus on eliciting specific language examples."
          },
          {
            role: "user",
            content: messageText
          }
        ];
        
        const perplexityResponse = await callPerplexityAPI(messages);
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
        console.error('Perplexity API error:', perplexityError);
        
        // If both APIs fail, provide a fallback response based on message content
        const normalizedMessage = messageText.toLowerCase().trim();
        
        // Simple language detection
        const hasTangkhulChars = /[ĀāA̲a̲]/.test(messageText);
        const commonEnglishWords = ['hi', 'hello', 'hey', 'yes', 'no', 'thanks', 'how', 'what', 'when', 'where', 'why'];
        const isSimpleEnglish = commonEnglishWords.some(word => normalizedMessage === word || normalizedMessage.startsWith(word + ' '));
        
        let fallbackResponse;
        if (hasTangkhulChars) {
          fallbackResponse = "Thank you for sharing that Tangkhul phrase. Could you tell me what it means in English?";
        } else if (isSimpleEnglish) {
          fallbackResponse = "I'd like to learn some Tangkhul phrases. Could you teach me a word or phrase in Tangkhul?";
        } else {
          fallbackResponse = "Thank you for your message. Could you share a phrase or word in Tangkhul with me?";
        }
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            response: fallbackResponse,
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
    console.error('Function error:', error);
    console.error('Error stack:', error.stack);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: "I'm here to help collect Tangkhul language examples. Could you share a phrase or word in Tangkhul with me?",
        error: error.message,
        stack: error.stack
      })
    };
  }
};

async function callOpenAIAPI(userMessage) {
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiKey) {
    throw new Error('Missing OpenAI API key');
  }
  
  console.log('OpenAI API key present');
  
  // Detect language features
  const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
  const normalizedMessage = userMessage.toLowerCase().trim();
  const isGreeting = ['hi', 'hello', 'hey', 'greetings'].includes(normalizedMessage);
  
  // Customize prompt based on message content
  let prompt;
  if (hasTangkhulChars) {
    prompt = `You are an AI assistant collecting Tangkhul language examples. The user has sent what appears to be a Tangkhul phrase: "${userMessage}". Ask them politely what it means in English.`;
  } else if (isGreeting) {
    prompt = `You are an AI assistant collecting Tangkhul language examples. The user has greeted you with: "${userMessage}". Welcome them and ask them to share a Tangkhul phrase or word with you.`;
  } else {
    prompt = `You are an AI assistant collecting Tangkhul language examples. Respond to this message: "${userMessage}". If it seems to be in Tangkhul, ask what it means. If it's in English, ask for a Tangkhul phrase related to the topic.`;
  }
  
  console.log('OpenAI prompt:', prompt);
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: "system",
            content: "You are an AI assistant designed to collect Tangkhul language examples. Use only English in your responses. Ask only ONE question at a time."
          },
          {
            role: "user",
            content: userMessage
          }
        ],
        max_tokens: 150,
        temperature: 0.7
      })
    });
    
    console.log('OpenAI response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status}, ${errorText}`);
    }
    
    const data = await response.json();
    console.log('OpenAI response data:', JSON.stringify(data));
    
    return data.choices[0].message.content.trim();
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
  
  console.log('Perplexity API key present');
  console.log('Perplexity messages:', JSON.stringify(messages));
  
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${perplexityKey}`
      },
      body: JSON.stringify({
        model: 'sonar-small-chat',
        messages: messages,
        max_tokens: 150,
        temperature: 0.7
      })
    });
    
    console.log('Perplexity response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Perplexity API error: ${response.status}, ${errorText}`);
    }
    
    const data = await response.json();
    console.log('Perplexity response data:', JSON.stringify(data));
    
    let aiResponse = data.choices[0].message.content;
    
    // Remove thinking sections if present
    aiResponse = aiResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    return aiResponse;
  } catch (error) {
    console.error('Error in Perplexity API call:', error);
    throw error;
  }
}
