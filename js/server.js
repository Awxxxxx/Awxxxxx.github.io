const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
// 允许跨域请求
app.use(cors());

// Apple WeatherKit 配置
const teamId = "WR7885F6JL";
const serviceId = "com.Secretbox.weatherkit-client";
const keyId = "F8N9S83ZPP";
const privateKeyPEM = `-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgT1F+xvciRZcXb5fA5zGVptBXctJG8uOGti+Xi/5KY6KgCgYIKoZIzj0DAQehRANCAAQ9I8YAAu1z5LFaAc2DgMsxCqoAuI4oIqKKU+0Vxm4pILecfMb/suvfHw7xdtzI41Qhl2TGTHhvSwx5e8cfhd8l
-----END PRIVATE KEY-----`;

function generateWeatherKitJWT() {
    const payload = {
        iss: teamId,
        sub: serviceId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
    };

    const token = jwt.sign(payload, privateKeyPEM, {
        algorithm: 'ES256',
        keyid: keyId,
        header: {
            id: `${teamId}.${serviceId}`
        }
    });

    return token;
}

// 修改为支持 CORS 预检请求并返回正确的头信息
app.get('/api/weather', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        if (!lat || !lon) {
            return res.status(400).json({ error: "Missing lat or lon" });
        }

        console.log(`[WeatherKit] Requesting weather for ${lat}, ${lon}`);
        const token = generateWeatherKitJWT();
        
        const url = `https://weatherkit.apple.com/api/v1/weather/zh-CN/${lat}/${lon}?dataSets=currentWeather,forecastDaily`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[WeatherKit] Apple API Error:", response.status, errorText);
            return res.status(response.status).json({ error: "Apple API Error", details: errorText });
        }

        const data = await response.json();
        console.log("[WeatherKit] Data fetched successfully");
        res.json(data);

    } catch (error) {
        console.error("[Server Error]", error);
        res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
});

// 托管静态文件 (提供 index.html 的访问)
app.use(express.static(__dirname));

// 部署在 Vercel、Heroku 等云平台时，通常使用 process.env.PORT
const PORT = process.env.PORT || 8000;
// 允许所有 IP 访问
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at port ${PORT}`);
});
