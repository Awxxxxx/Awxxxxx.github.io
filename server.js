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
        // Step 1: Call DeepSeek to get the quote and image prompt
        const promptForLLM = `你是一个温暖治愈的心理咨询师和资深插画艺术总监。
现在，我们的用户在“树洞天气”APP中倾诉了心事。

【当前信息】
- 日期：${date}
- 天气：${weather}
- 用户心事：${user_text}
- AI的回复：${ai_text}

【你的任务】
请仔细体会用户的情绪，完成以下两项任务，并以严格的 JSON 格式输出：

1. 提炼金句 (quote)：
写一句15-25字的中文鼓励/治愈短句，用于印在心情气象卡上。
要求：绝对不能直接暴露用户的心事！要把具体的心事转化为充满哲理、温暖治愈的安慰。语气要像一个温柔的朋友。

2. 构思画面描述 (image_prompt)：
将用户的情绪转化为一个唯美、治愈、充满希望的视觉意象。请用**英文**写一段AI绘画提示词（50-80个单词）。
要求：
- 如果用户情绪负面，请转化为“破茧成蝶”、“雨后春笋”、“暗夜微光”等充满希望的意象。
- 画面主体必须明确（例如：一只在雨中撑伞的小猫、一盏在森林中发光的温暖路灯、云层中透出的阳光）。
- 画面必须极其简单、干净。

【输出格式】
严格按照以下 JSON 格式输出，不要包含任何 markdown 标记（如 \`\`\`json）或其他多余的解释文字：
{
  "quote": "你提炼的中文治愈金句",
  "image_prompt": "你构思的英文画面描述"
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

        const { quote, image_prompt } = parsedResult;

        // Step 2: Call Volcengine to generate image
        const finalImagePrompt = `${image_prompt}, Studio Ghibli style, healing illustration, warm pastel colors, soft lighting, masterpiece, 8k resolution, flat color, minimalist design, simple background, pure background, extremely large empty negative space at the bottom, solid color bottom area for text placement`;
        const negativePrompt = "text, watermark, words, letters, typography, signature, ugly, messy, chaotic, horror, dark, scary, realistic photo, human face close-up, complex bottom area, messy bottom";

        const VOLCENGINE_API_KEY = '6647a69c-35fc-431d-9231-c5cb28062014';
        const VOLCENGINE_ENDPOINT = 'ep-20260414202334-tt4lc';

        const imageResponse = await axios({
            method: 'post',
            url: 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${VOLCENGINE_API_KEY}`
            },
            data: {
                model: VOLCENGINE_ENDPOINT,
                prompt: finalImagePrompt,
                negative_prompt: negativePrompt,
                size: "1536x2048" // 3:4 ratio
            }
        });

        // The image url or base64 will be returned
        const imageUrl = imageResponse.data.data[0].url || imageResponse.data.data[0].b64_json;

        res.json({
            quote,
            image: imageUrl
        });

    } catch (error) {
        console.error('Generate Card Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to generate card' });
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
