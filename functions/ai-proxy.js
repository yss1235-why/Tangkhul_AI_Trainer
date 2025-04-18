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
    
    // Extract messages array and user message correctly
    let messagesArray = [];
    let userMessage = "";
    
    if (requestBody.messages && Array.isArray(requestBody.messages)) {
      messagesArray = requestBody.messages;
      
      // Get the last user message
      const userMessages = messagesArray.filter(msg => msg.role === "user");
      if (userMessages.length > 0) {
        userMessage = userMessages[userMessages.length - 1].content;
      }
    } else if (requestBody.message) {
      userMessage = requestBody.message;
      messagesArray = [
        {
          role: "user",
          content: userMessage
        }
      ];
    }
    
    console.log('User message:', userMessage);
    
    // Perform initial language detection to enhance system prompt
    const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
    const normalizedMessage = userMessage.toLowerCase().trim();
    
    // Common English words for quick detection
    const englishWords = ['a', 'the', 'is', 'are', 'am', 'i', 'you', 'he', 'she', 'we', 'they', 
                         'how', 'what', 'when', 'where', 'why', 'who', 'can', 'could', 'will', 'would'];
    
    const words = normalizedMessage.split(/\s+/);
    let englishWordCount = 0;
    
    words.forEach(word => {
      const cleanWord = word.replace(/[.,?!;:'"()]/g, '');
      if (englishWords.includes(cleanWord)) {
        englishWordCount++;
      }
    });
    
    // Enhance system prompt based on language detection
    const isLikelyEnglish = englishWordCount >= 2 || 
                          normalizedMessage.startsWith('how') || 
                          normalizedMessage.startsWith('what') ||
                          normalizedMessage.startsWith('when') ||
                          normalizedMessage.startsWith('where') ||
                          normalizedMessage.startsWith('why');
    
    const isLikelyTangkhul = hasTangkhulChars || 
                           (words.length <= 2 && !isLikelyEnglish);
    
    // Find and update the system message with enhanced guidance
    const systemMessageIndex = messagesArray.findIndex(msg => msg.role === "system");
    let systemPrompt = "You are an AI assistant designed to collect Tangkhul language examples.";
    
    if (systemMessageIndex >= 0) {
      systemPrompt = messagesArray[systemMessageIndex].content;
    }
    
    // Add language-specific instructions based on detection
    let enhancedSystemPrompt = systemPrompt;
    
    if (isLikelyEnglish) {
      enhancedSystemPrompt += " The user's current message appears to be in English. Respond appropriately in English and ask a question to elicit Tangkhul language examples.";
    } else if (isLikelyTangkhul) {
      enhancedSystemPrompt += " The user's current message appears to be in Tangkhul. Ask them politely what it means in English.";
    }
    
    // Update or add the system message
    if (systemMessageIndex >= 0) {
      messagesArray[systemMessageIndex].content = enhancedSystemPrompt;
    } else {
      messagesArray.unshift({
        role: "system",
        content: enhancedSystemPrompt
      });
    }
    
    // Try Perplexity first (primary service)
    try {
      console.log('Attempting Perplexity API call');
      const perplexityResponse = await callPerplexityAPI(messagesArray);
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
      
      const openaiResponse = await callOpenAIAPI(userMessage, isLikelyEnglish, isLikelyTangkhul);
      
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
    console.error('Error stack:', error.stack);
    
    // Provide a generic fallback response
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

async function callPerplexityAPI(messagesArray) {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  
  if (!perplexityKey) {
    throw new Error('Missing Perplexity API key');
  }
  
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${perplexityKey}`
    },
    body: JSON.stringify({
      model: 'sonar-reasoning',
      messages: messagesArray,
      max_tokens: 150,
      temperature: 0.7
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity API error: ${response.status}, ${errorText}`);
  }
  
  const data = await response.json();
  let aiResponse = data.choices[0].message.content;
  
  // Remove thinking sections if present
  aiResponse = aiResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  
  return aiResponse;
}

async function callOpenAIAPI(userMessage, isLikelyEnglish, isLikelyTangkhul) {
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiKey) {
    throw new Error('Missing OpenAI API key');
  }
  
  // Create prompt based on language detection
  let prompt;
  
  if (isLikelyTangkhul) {
    prompt = `You are an AI assistant collecting Tangkhul language examples. The user has sent what appears to be a Tangkhul phrase: "${userMessage}". Ask them politely what it means in English.`;
  } else if (isLikelyEnglish) {
    prompt = `You are an AI assistant collecting Tangkhul language examples. The user has sent a message in English: "${userMessage}". Respond appropriately in English and ask ONE question to elicit Tangkhul language examples.`;
  } else {
    prompt = `You are an AI assistant collecting Tangkhul language examples. Respond to this message: "${userMessage}". First determine if it's in English or Tangkhul, then respond appropriately. If it seems to be in Tangkhul, ask what it means. If it's in English, ask for a Tangkhul phrase related to the topic.`;
  }
  
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
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status}, ${errorText}`);
  }
  
  const data = await response.json();
  return data.choices[0].text.trim();
}
