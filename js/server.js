/**
 * Tree Hole Weather - Backend Proxy Server
 *
 * This Express server acts as a secure proxy to Apple WeatherKit API.
 * It keeps the private key server-side and generates JWT tokens dynamically.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = 3000;

// --- Apple WeatherKit Configuration ---
const TEAM_ID = 'WR7885F6JL';
const SERVICE_ID = 'com.Secretbox.weatherkit-client';
const KEY_ID = 'F8N9S83ZPP';
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgT1F
+xvciRZcXb5fA5zGVptBXctJG8uOGti+Xi/
5KY6KgCgYIKoZIzj0DAQehRANCAAQ9I8YAAu1z5LFaAc2DgMsxCqoAuI4oIqKKU
+0Vxm4pILecfMb/suvfHw7xdtzI41Qhl2TGTHhvSwx5e8cfhd8l
-----END PRIVATE KEY-----`;

// Enable CORS for all origins (frontend can call this API)
app.use(cors());

// Serve static frontend files from current directory
app.use(express.static('.'));

/**
 * Generate an ES256 JWT for Apple WeatherKit authentication.
 * Token is valid for 1 hour.
 */
function generateWeatherKitToken() {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'ES256',
    kid: KEY_ID,
    id: `${TEAM_ID}.${SERVICE_ID}`
  };

  const payload = {
    iss: TEAM_ID,
    sub: SERVICE_ID,
    iat: now,
    exp: now + 3600 // 1 hour
  };

  return jwt.sign(payload, PRIVATE_KEY, { algorithm: 'ES256', header });
}

/**
 * GET /api/weather
 * Query params: lat (latitude), lon (longitude)
 * Proxies the request to Apple WeatherKit with proper auth.
 */
app.get('/api/weather', async (req, res) => {
  const { lat, lon } = req.query;

  // Validate parameters
  if (!lat || !lon) {
    return res.status(400).json({ error: 'Missing lat or lon query parameters' });
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);
  if (isNaN(latitude) || isNaN(longitude)) {
    return res.status(400).json({ error: 'lat and lon must be valid numbers' });
  }

  try {
    // Generate a fresh JWT token
    const token = generateWeatherKitToken();

    // Request weather data from Apple WeatherKit
    const url = `https://weatherkit.apple.com/api/v1/weather/en/${latitude}/${longitude}?dataSets=currentWeather,forecastDaily`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`WeatherKit API error (${response.status}):`, errorText);
      return res.status(response.status).json({
        error: 'WeatherKit API request failed',
        status: response.status,
        detail: errorText
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🌤  Tree Hole Weather server running at http://localhost:${PORT}`);
  console.log(`   API endpoint: http://localhost:${PORT}/api/weather?lat=39.9&lon=116.4`);
});
