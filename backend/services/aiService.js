import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const {
  AI_PROVIDER = 'gemini',
  AI_API_KEY,
  AI_MODEL,
  AI_ENDPOINT
} = process.env;

// Safe Default JSON Fallback Structure
const SAFE_FALLBACK = {
  actionable: false,
  status: null,
  comment: null,
  priority: null,
  tags: []
};

/**
 * Robust JSON Sanitizer and Extractor
 * Isolates the JSON substring from the LLM output and attempts to parse it safely.
 */
function sanitizeAndParseJSON(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return SAFE_FALLBACK;
  }

  let cleaned = rawText.trim();
  console.log('[AI-PARSE] Raw AI Output:', cleaned);

  try {
    // 1. Quick initial parse
    return JSON.parse(cleaned);
  } catch (err) {
    // Keep going to regex repair
  }

  try {
    // 2. Extract using regex between the first { and the last }
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extracted = jsonMatch[0];
      return JSON.parse(extracted);
    }
  } catch (err) {
    console.warn('[AI-PARSE] Regex JSON extraction failed. Attempting markdown fence stripping...', err.message);
  }

  try {
    // 3. Strip markdown backticks block and clean carriage returns
    let repair = cleaned
      .replace(/^```json/gi, '')
      .replace(/^```/g, '')
      .replace(/```$/g, '')
      .trim();

    return JSON.parse(repair);
  } catch (err) {
    console.error('[AI-PARSE ERROR] All parsing repair attempts failed. Using safe default.', err.message);
    return SAFE_FALLBACK;
  }
}

/**
 * Pluggable AI Service Adapter
 * Coordinates calls to Gemini, OpenAI, Claude, or Ollama, guaranteeing a standardized output.
 */
export async function analyzeTeamsMessage(messageText, taskContext) {
  const provider = (AI_PROVIDER || 'gemini').toLowerCase();
  
  const systemContextPrompt = `
Bạn là Trí Tuệ Nhân Tạo hỗ trợ tự động đồng bộ tiến độ công việc trên Synapse Collaboration từ hội thoại chat Microsoft Teams.

Thông tin công việc đang theo dõi:
- Tiêu đề: "${taskContext.title}"
- Mô tả hiện tại: "${taskContext.description || 'Không có'}"
- Trạng thái hiện tại: "${taskContext.status}" (Mã: todo, in_progress, review, done)
- Ưu tiên hiện tại: "${taskContext.priority}" (Mã: low, medium, high)

Nội dung tin nhắn nhận được trên MS Teams:
"${messageText}"

Phân tích tin nhắn trên và trả về kết quả định dạng JSON thuần tuý (strictly valid JSON) với cấu trúc sau:
{
  "actionable": true/false (true nếu tin nhắn có đề cập trực tiếp đến việc thay đổi tiến độ, trạng thái, bình luận hoặc độ ưu tiên của công việc này),
  "status": "todo" | "in_progress" | "review" | "done" | null (mã trạng thái mới nếu người dùng yêu cầu cập nhật hoặc thông báo đã làm xong, nếu không đổi hãy trả về null),
  "priority": "low" | "medium" | "high" | null (mã ưu tiên mới nếu có nhắc đến đổi ưu tiên, nếu không hãy trả về null),
  "comment": "Nội dung tóm tắt bình luận bằng tiếng Việt" | null (viết một bình luận tóm tắt ngắn gọn và lịch sự dạng: "Người dùng Nguyễn Văn A báo cáo: [tóm tắt nội dung chính về công việc]", nếu không có thông tin thảo luận hữu ích hãy trả về null),
  "tags": ["tag1", "tag2"] (danh sách nhãn dán mới được nhắc tới nếu có, ví dụ: bug, figma, api, nếu không trả về mảng rỗng)
}

Quy định đặc biệt:
1. KHÔNG thêm bất kỳ câu giải thích nào bên ngoài mã JSON.
2. Trả về đúng định dạng JSON chuẩn.
3. Không dịch mã trạng thái và mã ưu tiên, giữ đúng các giá trị: todo, in_progress, review, done, low, medium, high.
`;

  try {
    switch (provider) {
      case 'openai':
        return await callOpenAI(systemContextPrompt);
      case 'anthropic':
      case 'claude':
        return await callClaude(systemContextPrompt);
      case 'ollama':
        return await callOllama(systemContextPrompt);
      case 'gemini':
      default:
        return await callGemini(systemContextPrompt);
    }
  } catch (err) {
    console.error(`[AI SERVICE ERROR] Failed to fetch response from provider [${provider}]:`, err.message);
    return SAFE_FALLBACK;
  }
}

// ==========================================
// INDIVIDUAL LLM ADAPTERS
// ==========================================

// 1. Google Gemini API Adapter
async function callGemini(prompt) {
  if (!AI_API_KEY) {
    console.warn('[AI SERVICE] AI_API_KEY is not configured for Gemini. Falling back to Mock analysis.');
    return mockAIAnalysis(prompt);
  }

  const model = AI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${AI_API_KEY}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  const response = await axios.post(url, payload, { timeout: 12000 });
  const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return sanitizeAndParseJSON(rawText);
}

// 2. OpenAI API Adapter
async function callOpenAI(prompt) {
  if (!AI_API_KEY) {
    throw new Error('AI_API_KEY is required for OpenAI provider');
  }

  const model = AI_MODEL || 'gpt-4o-mini';
  const url = 'https://api.openai.com/v1/chat/completions';

  const payload = {
    model: model,
    messages: [
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' }
  };

  const response = await axios.post(url, payload, {
    headers: {
      'Authorization': `Bearer ${AI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 12000
  });

  const rawText = response.data?.choices?.[0]?.message?.content;
  return sanitizeAndParseJSON(rawText);
}

// 3. Anthropic Claude API Adapter
async function callClaude(prompt) {
  if (!AI_API_KEY) {
    throw new Error('AI_API_KEY is required for Anthropic Claude provider');
  }

  const model = AI_MODEL || 'claude-3-5-sonnet-20241022';
  const url = 'https://api.anthropic.com/v1/messages';

  const payload = {
    model: model,
    max_tokens: 1000,
    messages: [
      { role: 'user', content: prompt + '\nNote: Respond strictly with valid JSON. Do not add markdown blocks.' }
    ]
  };

  const response = await axios.post(url, payload, {
    headers: {
      'x-api-key': AI_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    timeout: 12000
  });

  const rawText = response.data?.content?.[0]?.text;
  return sanitizeAndParseJSON(rawText);
}

// 4. Ollama Local LLM Adapter
async function callOllama(prompt) {
  const endpoint = AI_ENDPOINT || 'http://localhost:11434';
  const model = AI_MODEL || 'llama3';
  const url = `${endpoint}/api/generate`;

  const payload = {
    model: model,
    prompt: prompt,
    format: 'json',
    stream: false
  };

  const response = await axios.post(url, payload, { timeout: 15000 });
  const rawText = response.data?.response;
  return sanitizeAndParseJSON(rawText);
}

// ==========================================
// MOCK FALLBACK (If keys are not supplied)
// ==========================================
function mockAIAnalysis(prompt) {
  console.log('[AI MOCK] Simulating AI analysis since no API key is provided...');
  
  const text = prompt.toLowerCase();
  
  let result = {
    actionable: false,
    status: null,
    comment: null,
    priority: null,
    tags: []
  };

  // Simple heuristic parsing for immediate testing without API Keys
  if (text.includes('xong') || text.includes('hoan thanh') || text.includes('done')) {
    result.actionable = true;
    result.status = 'done';
    result.comment = 'Báo cáo hoàn thành công việc từ MS Teams.';
  } else if (text.includes('review') || text.includes('kiem tra')) {
    result.actionable = true;
    result.status = 'review';
    result.comment = 'Yêu cầu chuyển sang đang review từ MS Teams.';
  } else if (text.includes('dang lam') || text.includes('trien khai')) {
    result.actionable = true;
    result.status = 'in_progress';
    result.comment = 'Báo cáo bắt tay vào làm việc từ MS Teams.';
  }

  if (text.includes('khan cap') || text.includes('gap') || text.includes('high')) {
    result.actionable = true;
    result.priority = 'high';
  }

  return result;
}
