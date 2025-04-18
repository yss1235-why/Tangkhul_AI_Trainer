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
    
    // Common English greetings and responses
    const englishPhrases = [
      'hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 
      'good evening', 'yes', 'no', 'thanks', 'thank you', 'ok', 'okay'
    ];
    
    // Potential Tangkhul words (a small sample)
    const tangkhulWords = ['ei', 'nang', 'aning', 'katha', 'kala', 'eina', 'mirin'];
    
    // Check if message contains special Tangkhul characters
    const hasTangkhulChars = /[ĀāA̲a̲]/.test(userMessage);
    
    // Normalize message for comparison
    const normalizedMessage = userMessage.toLowerCase().trim();
    
    // Check if it's a common English phrase
    if (englishPhrases.some(phrase => normalizedMessage === phrase || normalizedMessage.startsWith(phrase + ' '))) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          response: "I'd love to learn some Tangkhul phrases. Could you share a word or sentence in Tangkhul with me?",
          provider: 'direct'
        })
      };
    }
    
    // Check if it might be Tangkhul (either has special chars or matches known Tangkhul words)
    if (hasTangkhulChars || tangkhulWords.some(word => normalizedMessage === word || normalizedMessage.includes(' ' + word + ' '))) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          response: "Thank you for sharing that Tangkhul phrase. Could you tell me what it means in English?",
          provider: 'direct'
        })
      };
    }
    
    // For very short messages (1-2 words) that aren't recognized as English phrases
    if (normalizedMessage.split(' ').length <= 2 && normalizedMessage.length < 12) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          response: "Is that a Tangkhul word or phrase? Could you tell me what it means in English?",
          provider: 'direct'
        })
      };
    }
    
    // For other messages in English, provide a generic response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        response: "Thank you for sharing. Could you teach me how to say something similar in Tangkhul?",
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
