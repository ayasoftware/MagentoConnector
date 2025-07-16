const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();

const API_KEYS = {
  VERTEX_AI: SCRIPT_PROPERTIES.getProperty('vertexAiApiKey'),
  GEMINI: SCRIPT_PROPERTIES.getProperty('geminiApiKey'),
  CHAT_GPT: SCRIPT_PROPERTIES.getProperty('chatGptApiKey'),
  DEEPSEEK: SCRIPT_PROPERTIES.getProperty('deepSeekApiKey')
};

const API_URLS = {
  VERTEX_AI: "https://us-central1-picometrics.cloudfunctions.net/vertexAiAgent",
  GEMINI: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${API_KEYS.GEMINI}`,
  CHAT_GPT: 'https://api.openai.com/v1/chat/completions',
  DEEPSEEK: 'https://api.deepseek.com/chat/completions'
};

const MODELS = {
  CHAT_GPT: "gpt-4o-mini",
  DEEPSEEK: "deepseek-chat"
};

function getInsightsVertexAi(dataToAnalyze, prompt) {
  const token = API_KEYS.VERTEX_AI;
  const url = API_URLS.VERTEX_AI;

  const baseMessage = prompt 
    ? {"message": `Analyze this data in JSON format , and answer in ${getUserLanguage()} this question: ${prompt}. Only based on this data. Limit the answer to 10000 characters maximum. Avoid returning a summary of the statistics.:\n ${JSON.stringify(dataToAnalyze, null, 2)}`}
    : {"message":`Analyze this data in JSON format. Limit the answer to 10000 characters maximum. Avoid returning a summary of the statistics. Give me only key insights and main recommendations in ${getUserLanguage()}:\n ${JSON.stringify(dataToAnalyze, null, 2)}`};

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'headers': {
      'Authorization': 'Bearer ' + token
    },
    'payload': JSON.stringify(baseMessage)
  };

  if (!dataToAnalyze) {
    return { "error": "No data to analyze was provided." };
  }

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    console.log('Vertex AI Agent Response:', result);

    const content = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log('Vertex AI Agent Text Content:', content);
    return { "analysis": content };
  } catch (error) {
    console.log('Error calling Vertex AI Agent:', error);
    return { "error": `Error calling Vertex AI Agent: ${error.message || error}` };
  }
}

function getInsightsGemini(dataToAnalyze, prompt) {
  const url = API_URLS.GEMINI;

  if (!dataToAnalyze) {
    return { "error": "No data to analyze provided." };
  }

  try {
    const systemPrompt = "You are a data analyst.";
    const userPrompt = prompt
      ? `Analyze this json formatted data, and answer in ${getUserLanguage()} this question ${prompt}. Only based on this json formatted data. Limit the answer to 10000 characters maximum . Avoid returning a summary of the statistics. :\n ${JSON.stringify(dataToAnalyze, null, 2)}`
      : `Analyze this data. limit the answer to 10000 characters maximum . Avoid returning a summary of the statistics. give me only key insights and main recommendations in ${getUserLanguage()}:\n ${JSON.stringify(dataToAnalyze, null, 2)}`;

    const payload = JSON.stringify({
      contents: [
        {
          role: "system",
          parts: [{ text: systemPrompt }]
        },
        {
          role: "user",
          parts: [{ text: userPrompt }]
        }
      ]
    });

    const response = UrlFetchApp.fetch(url, {
      method: "post",
      headers: {
        "Content-Type": "application/json"
      },
      payload: payload,
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());

    if (result.error) {
      console.error("API Error:", result.error);
      return {
        error: result.error.message || "Unknown API error"
      };
    }

    const content = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("Generated Text: ", content);
    return {
      analysis: content
    };
  } catch (error) {
    console.error('Error fetching Gemini insights:', error.message, error);
    return {
      error: error.message
    };
  }
}

function getInsightsChatGpt(dataToAnalyze, prompt) {
  const apiKey = API_KEYS.CHAT_GPT;
  const url = API_URLS.CHAT_GPT;

  if (!dataToAnalyze) {
    return { "error": "No data to analyze provided." };
  }

  try {
    console.log('ChatGPT prompt', prompt);
    let message = [];
    if (!prompt) {
      message = [
        { "role": "system", "content": "You are a data analyst." },
        { "role": "user", "content": `Analyze this data. limit the answer to 10000 characters maximum . Avoid returning a summary of the statistics. give me only key insights and main recommendations in ${getUserLanguage()}:\n ${JSON.stringify(dataToAnalyze, null, 2)}` }
      ];
    } else {
      message = [
        { "role": "system", "content": "You are a data analyst." },
        { "role": "user", "content": `Analyze this json formatted data, and answer in ${getUserLanguage()} this question ${prompt}. Only based on this json formatted data. Limit the answer to 10000 characters maximum . Avoid returning a summary of the statistics. :\n ${JSON.stringify(dataToAnalyze, null, 2)}` }
      ];
    }

    const payload = JSON.stringify({
      model: MODELS.CHAT_GPT,
      messages: message
    });

    const response = UrlFetchApp.fetch(url, {
      method: "post",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      payload: payload,
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());
    const content = result.choices[0]?.message?.content || "";

    return {
      'analysis': content
    };
  } catch (error) {
    console.error('Error fetching ChatGPT insights:', error.message);
    return { "error": `Error fetching ChatGPT insights: ${error.message || error}` };
  }
}

function getInsightsDeepSeek(dataToAnalyze, prompt) {
  const apiKey = API_KEYS.DEEPSEEK;
  const url = API_URLS.DEEPSEEK;

  if (!dataToAnalyze) {
    return { "error": "No data to analyze provided." };
  }

  try {
    console.log('DeepSeek prompt', prompt);
    let message = [];
    if (!prompt) {
      message = [
        { "role": "system", "content": "You are a data analyst." },
        { "role": "user", "content": `Analyze this data. limit the answer to 10000 characters maximum . Avoid returning a summary of the statistics. give me only key insights and main recommendations in ${getUserLanguage()}:\n ${JSON.stringify(dataToAnalyze, null, 2)}` }
      ];
    } else {
      message = [
        { "role": "system", "content": "You are a data analyst." },
        { "role": "user", "content": `Analyze this json formatted data, and answer in ${getUserLanguage()} this question ${prompt}. Only based on this json formatted data. Limit the answer to 10000 characters maximum . Avoid returning a summary of the statistics. :\n ${JSON.stringify(dataToAnalyze, null, 2)}` }
      ];
    }

    const payload = JSON.stringify({
      model: MODELS.DEEPSEEK,
      messages: message
    });

    const response = UrlFetchApp.fetch(url, {
      method: "post",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      payload: payload,
      muteHttpExceptions: false
    });

    const result = JSON.parse(response.getContentText());
    const reasoning_content = result.choices[0].message.reasoning_content;
    const content = result.choices[0].message.content;

    return {
      'analysis': content,
      'reasoning_content': reasoning_content
    };
  } catch (error) {
    console.error('Error fetching DeepSeek insights:', error.message);
    return { "error": `Error fetching DeepSeek insights: ${error.message || error}` };
  }
}