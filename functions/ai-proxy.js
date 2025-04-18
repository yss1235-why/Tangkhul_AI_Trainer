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

  console.log('Request received:', event.body);

  try {
    const requestBody = JSON.parse(event.body);
    const userMessage = requestBody.message || "";
    
    // Debug the incoming request
    console.log('Processing message:', userMessage);
    
    // Use a very simple prompt structure
    const openaiKey = process.env.OPENAI_API_KEY;
    console.log('OpenAI Key available:', !!openaiKey);
    
    const apiResponse = await fetch('https://api.openai.com/v1/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo-instruct',
        prompt: `You are an AI assistant collecting Tangkhul language examples. Respond to this message: "${userMessage}". Ask ONE question about Tangkhul language.`,
        max_tokens: 150,
        temperature: 0.7
      })
    });
    
    const responseText = await apiResponse.text();
    console.log('API response status:', apiResponse.status);
    console.log('API response preview:', responseText.substring(0, 100));
    
    if (!apiResponse.ok) {
      throw new Error(`API error: ${apiResponse.status} - ${responseText}`);
    }
    
    const data = JSON.parse(responseText);
    const aiResponse = data.choices[0].text.trim();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ response: aiResponse })
    };
  } catch (error) {
    console.error('Function error:', error);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: "Thank you for sharing that Tangkhul phrase. Could you tell me what it means in English?",
        error: error.message
      })
    };
  }
};
