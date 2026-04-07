const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(bodyParser.json());
const upload = multer({ storage: multer.memoryStorage() });

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

app.post('/api/tts', async (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    try {
        const response = await axios({
            method: 'post',
            url: 'https://openspeech.bytedance.com/api/v1/tts',
            headers: {
                'Authorization': `Bearer;${VOLCENGINE_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: {
                app: {
                    appid: VOLCENGINE_APP_ID,
                    token: VOLCENGINE_TOKEN,
                    cluster: 'volcano_tts'
                },
                user: { uid: 'user_frontend' },
                audio: {
                    voice_type: 'BV700_streaming',
                    encoding: 'mp3',
                    speed_ratio: 1.0
                },
                request: {
                    reqid: uuidv4(),
                    text: text,
                    text_type: 'plain',
                    operation: 'query'
                }
            }
        });

        if (response.data.data) {
            const audioBuffer = Buffer.from(response.data.data, 'base64');
            res.setHeader('Content-Type', 'audio/mpeg');
            res.send(audioBuffer);
        } else {
            console.error("TTS Error Data:", response.data);
            res.status(500).json({ error: 'TTS Synthesis failed' });
        }
    } catch (error) {
        console.error('Volcengine TTS Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'TTS Service unavailable' });
    }
});

app.post('/api/asr', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Audio file is required' });
    }

    try {
        const audioBuffer = req.file.buffer;
        
        const response = await axios({
            method: 'post',
            url: 'https://openspeech.bytedance.com/api/v1/asr',
            headers: {
                'Authorization': `Bearer;${VOLCENGINE_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: {
                app: {
                    appid: VOLCENGINE_APP_ID,
                    token: VOLCENGINE_TOKEN,
                    cluster: 'volcengine_streaming_common'
                },
                user: { uid: 'user_frontend' },
                audio: {
                    format: 'wav',
                    rate: 16000,
                    bits: 16,
                    channel: 1,
                    codec: 'raw'
                },
                request: {
                    reqid: uuidv4(),
                    sequence: -1,
                    text: '',
                    session_id: uuidv4()
                },
                payload: audioBuffer.toString('base64')
            }
        });

        if (response.data && response.data.result && response.data.result.length > 0) {
            const text = response.data.result[0].text;
            res.json({ text });
        } else {
            console.error("ASR Error Data:", response.data);
            res.status(500).json({ error: 'ASR recognition failed or no text found' });
        }
    } catch (error) {
        console.error('Volcengine ASR Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'ASR Service unavailable' });
    }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

// 导出 app 实例供 Vercel Serverless Function 使用
module.exports = app;
