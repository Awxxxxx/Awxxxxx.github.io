const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.raw({ type: 'audio/wav', limit: '10mb' })); // 处理前端直接传来的 raw audio

// 生成随机 UUID (替换原来的 uuid 包以避免 ESM 问题)
function uuidv4() {
    return crypto.randomUUID();
}

// Serve frontend files
app.use(express.static('www'));

const DEEPSEEK_API_KEY = 'sk-67137a3b55104238aa30608376b91f4d';
const VOLCENGINE_APP_ID = '1436594062';
const VOLCENGINE_TOKEN = 'F1I4Xoj_5bfJA0jklIdNh5suWaJY0MUx';

const SYSTEM_PROMPT = `你现在是“树洞天气”APP里一个温暖、有同理心、且像人类好朋友一样的倾听者。
用户会在这里分享他们的喜怒哀乐，或者只是随口说一些日常琐事。请你根据用户输入的内容和情绪，给出个性化的回复。
请遵循以下原则进行回复：
1. 识别情绪并共情：
   - 如果用户分享烦恼或难过的事：请给予温柔的安慰和理解，表达“我在这里陪着你”，不要说教，不要给出专业的医疗/心理诊断建议。
   - 如果用户分享开心或成就：请真诚地为他们感到高兴，分享他们的喜悦，可以用稍微活泼一点的语气。
   - 如果用户分享平淡的日常或无关心情的事：请像老朋友一样自然地搭话、倾听，或者给出简单友善的回应。
2. 语气与口吻：使用第一人称“我”，语气要自然、亲切、口语化，就像现实中懂你的好朋友在微信上聊天一样，避免机器感和官方套话。
3. 篇幅限制：回复要简短精炼，不要长篇大论，字数尽量控制在 50 到 100 字之间。
4. 交互限制：由于你与用户的交互是单次的，所以一定不要用问句结尾。`;

app.post('/api/chat', async (req, res) => {
    const userMessage = req.body.message;

    if (!userMessage) {
        return res.status(400).json({ error: 'Message is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const response = await axios({
            method: 'post',
            url: 'https://api.deepseek.com/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            data: {
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userMessage }
                ],
                stream: true
            },
            responseType: 'stream'
        });

        response.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line.replace(/^data: /, '') === '[DONE]') {
                    res.write('event: done\\ndata: [DONE]\\n\\n');
                    res.end();
                    return;
                }
                if (line.startsWith('data: ')) {
                    try {
                        const parsed = JSON.parse(line.replace(/^data: /, ''));
                        if (parsed.choices && parsed.choices[0].delta.content) {
                            const content = parsed.choices[0].delta.content;
                            res.write(`data: ${JSON.stringify({ content })}\\n\\n`);
                        }
                    } catch (e) {
                        // ignore parse error for incomplete chunks or keep-alive pings
                    }
                }
            }
        });

        response.data.on('end', () => {
            res.end();
        });

        response.data.on('error', (err) => {
            console.error('Stream error:', err);
            res.write(`event: error\\ndata: ${JSON.stringify({ error: 'Stream interrupted' })}\\n\\n`);
            res.end();
        });

    } catch (error) {
        console.error('DeepSeek API Error:', error.response ? error.response.data : error.message);
        res.write(`event: error\\ndata: ${JSON.stringify({ error: 'Service unavailable' })}\\n\\n`);
        res.end();
    }
});

app.post('/api/generate-card', async (req, res) => {
    const { date, weather, user_text, ai_text } = req.body;

    if (!date || !weather || !user_text || !ai_text) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const promptForLLM = `你是一个温暖治愈的心理咨询师。
现在，我们的用户在“树洞天气”APP中倾诉了心事。

【当前信息】
- 日期：${date}
- 天气：${weather}
- 用户心事：${user_text}
- AI的回复：${ai_text}

【你的任务】
提炼金句 (quote)：
请仔细体会用户的情绪，写一句15-25字的中文鼓励/治愈短句，用于印在心情气象卡上。
要求：绝对不能直接暴露用户的心事！要把具体的心事转化为充满哲理、温暖治愈的安慰。语气要像一个温柔的朋友。

【输出格式】
严格按照以下 JSON 格式输出，不要包含任何 markdown 标记（如 \`\`\`json）或其他多余的解释文字：
{
  "quote": "你提炼的中文治愈金句"
}`;

        const deepseekResponse = await axios({
            method: 'post',
            url: 'https://api.deepseek.com/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            data: {
                model: 'deepseek-chat',
                messages: [
                    { role: 'user', content: promptForLLM }
                ],
                response_format: { type: 'json_object' }
            }
        });

        const llmContent = deepseekResponse.data.choices[0].message.content;
        let parsedResult;
        try {
            const cleaned = llmContent.replace(/```json/g, '').replace(/```/g, '').trim();
            parsedResult = JSON.parse(cleaned);
        } catch (e) {
            console.error('Failed to parse DeepSeek response:', llmContent);
            return res.status(500).json({ error: 'Failed to parse AI response' });
        }

        const { quote } = parsedResult;

        res.json({
            quote
        });

    } catch (error) {
        console.error('Generate Card Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to generate card text' });
    }
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

// 导出 app 实例供 Vercel Serverless Function 使用
module.exports = app;
