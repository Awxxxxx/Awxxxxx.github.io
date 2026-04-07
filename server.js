const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();

// 允许跨域请求
app.use(cors());

// 解析 JSON body
app.use(express.json());

// WeatherKit API 配置
const TEAM_ID = 'WR7885F6JL';
const SERVICE_ID = 'com.Secretbox.weatherkit-client';
const KEY_ID = 'F8N9S83ZPP';
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgT1F+xvciRZcXb5fA5zGVptBXctJG8uOGti+Xi/5KY6KgCgYIKoZIzj0DAQehRANCAAQ9I8YAAu1z5LFaAc2DgMsxCqoAuI4oIqKKU+0Vxm4pILecfMb/suvfHw7xdtzI41Qhl2TGTHhvSwx5e8cfhd8l
-----END PRIVATE KEY-----`;

// 生成 JWT Token 的逻辑
function generateWeatherKitToken() {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600; // 1小时后过期

    const payload = {
        iss: TEAM_ID,
        sub: SERVICE_ID,
        iat,
        exp
    };

    const header = {
        alg: 'ES256',
        kid: KEY_ID,
        id: `${TEAM_ID}.${SERVICE_ID}`
    };

    return jwt.sign(payload, PRIVATE_KEY, { algorithm: 'ES256', header });
}

// 获取天气数据的 API 路由
app.get('/api/weather', async (req, res) => {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
        return res.status(400).json({ error: '缺少经纬度参数 lat 或 lon' });
    }

    try {
        const token = generateWeatherKitToken();
        
        // 动态引入 node-fetch，兼容不同的 Node.js 版本
        const fetch = (await import('node-fetch')).default || require('node-fetch');

        // 请求 WeatherKit 接口
        // 获取当前天气 (currentWeather) 和未来预报 (forecastDaily)
        const url = `https://weatherkit.apple.com/api/v1/weather/zh-CN/${lat}/${lon}?dataSets=currentWeather,forecastDaily`;
        
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`WeatherKit API responded with status ${response.status}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('获取 WeatherKit 数据失败:', error);
        res.status(500).json({ error: '获取天气数据失败' });
    }
});

// DeepSeek 聊天 API 路由 (标准 JSON 响应，适配 Vercel)
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: '缺少 message 参数' });
    }

    try {
        const fetch = (await import('node-fetch')).default || require('node-fetch');
        
        const systemPrompt = `你现在是“树洞天气”APP里一个温暖、有同理心、且像人类好朋友一样的倾听者。 
用户会在这里分享他们的喜怒哀乐，或者只是随口说一些日常琐事。请你根据用户输入的内容和情绪，给出个性化的回复。 
请遵循以下原则进行回复： 
1. 识别情绪并共情： 
   - 如果用户分享烦恼或难过的事：请给予温柔的安慰和理解，表达“我在这里陪着你”，不要说教，不要给出专业的医疗/心理诊断建议。 
   - 如果用户分享开心或成就：请真诚地为他们感到高兴，分享他们的喜悦，可以用稍微活泼一点的语气。 
   - 如果用户分享平淡的日常或无关心情的事：请像老朋友一样自然地搭话、倾听，或者给出简单友善的回应。 
2. 语气与口吻：使用第一人称“我”，语气要自然、亲切、口语化，就像现实中懂你的好朋友在微信上聊天一样，避免机器感和官方套话。 
3. 篇幅限制：回复要简短精炼，不要长篇大论，字数尽量控制在 50 到 100 字之间。 
4. 交互限制：由于你与用户的交互是单次的，所以一定不要用问句结尾。`;

        console.log("正在向 DeepSeek 发起请求 (非流式)...");

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer sk-67137a3b55104238aa30608376b91f4d`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message }
                ],
                stream: false // 彻底关闭流式，使用最稳定的普通请求
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('DeepSeek API Error Body:', errorText);
            throw new Error(`DeepSeek API responded with status ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";
        
        console.log("成功获取到 DeepSeek 回复，返回给前端。");
        
        // 直接返回标准 JSON 给前端
        res.json({ content });

    } catch (error) {
        console.error('获取 DeepSeek 回复失败:', error);
        res.status(500).json({ error: '树洞暂时睡着了' });
    }
});

// 兼容 Vercel Serverless Function 部署
if (process.env.NODE_ENV !== 'production' && require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
