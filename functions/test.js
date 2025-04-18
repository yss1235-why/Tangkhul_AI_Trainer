// functions/test.js
exports.handler = async function(event, context) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Function is working correctly",
      environment: {
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasPerplexityKey: !!process.env.PERPLEXITY_API_KEY,
        hasDatabaseURL: !!process.env.REACT_APP_FIREBASE_DATABASE_URL,
        hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT
      }
    })
  };
};
