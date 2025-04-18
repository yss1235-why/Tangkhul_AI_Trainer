const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Parse the request
    const requestBody = JSON.parse(event.body);
    const userMessage = requestBody.message || "Hi";
    
    // Simplified prompt to reduce complexity
    const prompt = `As an AI assistant collecting Tangkhul language examples, respond to: "${userMessage}". 
    Your response should be in English, ask only ONE question, be concise, and focus on eliciting Tangkhul language examples.`;
    
    // Use OpenAI with minimal context for reliability
    const openaiKey = process.env.OPENAI_API_KEY;
    
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
            content: "You are an AI assistant designed to collect Tangkhul language examples."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 150,
        temperature: 0.7
      })
    });
    
    // Handle API response
    if (!response.ok) {
      console.error(`OpenAI API error: ${response.status}`);
      return {
        statusCode: 200, // Return 200 even if API fails
        headers,
        body: JSON.stringify({ 
          response: "I'm having trouble connecting to my language services. Could you please share a Tangkhul word or phrase with me?" 
        })
      };
    }
    
    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ response: aiResponse })
    };
  } catch (error) {
    console.error('Function error:', error);
    
    // Return a fallback response rather than error status
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: "I'd like to learn more Tangkhul words. Can you teach me how to say something in Tangkhul?" 
      })
    };
  }
};
