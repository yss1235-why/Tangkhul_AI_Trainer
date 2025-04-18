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

  try {
    const requestBody = JSON.parse(event.body);
    
    // Find the last user message
    let userMessage = "";
    if (requestBody.messages && Array.isArray(requestBody.messages)) {
      const userMessages = requestBody.messages.filter(msg => msg.role === "user");
      if (userMessages.length > 0) {
        userMessage = userMessages[userMessages.length - 1].content;
      }
    } else if (requestBody.message) {
      userMessage = requestBody.message;
    }
    
    // Log the user message
    console.log('User message:', userMessage);
    
    // Common English greetings
    const englishGreetings = ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'];
    
    // Check if the message is a simple English greeting
    const normalizedMessage = userMessage.toLowerCase().trim();
    if (englishGreetings.some(greeting => normalizedMessage.includes(greeting))) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          response: "Hello! I'm the Tangkhul AI Trainer assistant. I'm here to help collect Tangkhul language examples. Would you be willing to share a Tangkhul phrase or word with me today?",
          provider: 'direct'
        })
      };
    }
    
    // Check if message might be in Tangkhul (contains special characters)
    const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
    if (hasTangkhulChars) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          response: "Thank you for sharing that Tangkhul phrase. Could you tell me what it means in English?",
          provider: 'direct'
        })
      };
    }
    
    // For other messages in English, provide a generic response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        response: "That's interesting. Could you share a phrase or sentence in Tangkhul that relates to what you just mentioned?",
        provider: 'direct'
      })
    };
  } catch (error) {
    console.error('Function error:', error);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        response: "I'm here to help collect Tangkhul language examples. Could you share a phrase or word in Tangkhul with me?",
        error: error.message
      })
    };
  }
};
