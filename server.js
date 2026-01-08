require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; 

app.use(express.static(path.join(__dirname, 'public')));

app.post('/twiml', (req, res) => {
    res.type('text/xml');
    res.send(`
        <Response>
            <Connect>
                <Stream url="wss://${req.headers.host}/media-stream" />
            </Connect>
        </Response>
    `);
});

wss.on('connection', (ws, req) => {
    const url = req.url;
    if (url === '/media-stream') {
        handleTwilioConnection(ws);
    } else {
        handleFrontendConnection(ws);
    }
});

let activeTwilioConnection = null;

function handleFrontendConnection(ws) {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.event === 'speak_text') {
                console.log(`[Frontend] Gautas tekstas: ${data.text}`);
                if (activeTwilioConnection && activeTwilioConnection.readyState === WebSocket.OPEN) {
                    await streamTextToVoice(data.text, activeTwilioConnection);
                } else {
                    console.log("Klaida: Nėra aktyvaus skambučio.");
                }
            }
        } catch (e) { console.error(e); }
    });
}

function handleTwilioConnection(ws) {
    console.log("[Twilio] Telefonas prisijungė");
    activeTwilioConnection = ws; 
    ws.on('close', () => {
        console.log('[Twilio] Skambutis baigtas');
        activeTwilioConnection = null;
    });
}

async function streamTextToVoice(text, twilioWs) {
    const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream-input?model_id=eleven_turbo_v2_5`;
    const elevenWs = new WebSocket(wsUrl);

    elevenWs.on('open', () => {
        const bosMessage = {
            "text": " ",
            "voice_settings": { "stability": 0.4, "similarity_boost": 0.8 },
            "xi_api_key": ELEVENLABS_API_KEY
        };
        elevenWs.send(JSON.stringify(bosMessage));
        const textMessage = { "text": text, "try_trigger_generation": true };
        elevenWs.send(JSON.stringify(textMessage));
        elevenWs.send(JSON.stringify({ "text": "" }));
    });

    elevenWs.on('message', (data) => {
        const response = JSON.parse(data);
        if (response.audio && twilioWs.readyState === WebSocket.OPEN) {
            twilioWs.send(JSON.stringify({
                event: 'media',
                media: { payload: response.audio }
            }));
        }
    });
}

server.listen(PORT, () => {
    console.log(`--- SERVERIS VEIKIA: http://localhost:${PORT} ---`);
});