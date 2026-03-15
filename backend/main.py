import os
import io
import json
import base64
import logging
import asyncio
import fractions
import websockets
import av
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import MediaStreamTrack

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Critical CORS config for Vite React app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Offer(BaseModel):
    sdp: str
    type: str

class CustomAudioTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(self):
        super().__init__()
        self.queue = asyncio.Queue()
        self.time_base = fractions.Fraction(1, 24000)
        self.samples_per_frame = 480  # 20ms at 24000Hz
        self._timestamp = 0
        self.buffer = bytearray()

    async def recv(self):
        while len(self.buffer) < self.samples_per_frame * 2:
            chunk = await self.queue.get()
            self.buffer.extend(chunk)

        frame_bytes = self.buffer[:self.samples_per_frame * 2]
        self.buffer = self.buffer[self.samples_per_frame * 2:]

        frame = av.AudioFrame(format='s16', layout='mono', samples=self.samples_per_frame)
        frame.planes[0].update(bytes(frame_bytes))
        frame.sample_rate = 24000
        frame.pts = self._timestamp
        frame.time_base = self.time_base
        self._timestamp += self.samples_per_frame
        return frame

async def gemini_ws_loop(ws, custom_audio_track):
    logger.info("Started Gemini WebSocket listener loop.")
    try:
        async for msg in ws:
            if isinstance(msg, bytes):
                continue
            response = json.loads(msg)
            if "serverContent" in response:
                model_turn = response["serverContent"].get("modelTurn")
                if model_turn:
                    for part in model_turn.get("parts", []):
                        if "inlineData" in part:
                            inline_data = part["inlineData"]
                            if inline_data.get("mimeType", "").startswith("audio/pcm"):
                                audio_bytes = base64.b64decode(inline_data["data"])
                                logger.info(f"🎤 Received Gemini audio chunk! ({len(audio_bytes)} bytes)")
                                await custom_audio_track.queue.put(audio_bytes)
            elif "error" in response:
                logger.error(f"❌ Gemini API Error: {response['error']}")
    except Exception as e:
        logger.error(f"Gemini WS Loop error: {e}")

async def forward_video(ws, track):
    try:
        while True:
            frame = await track.recv()
            img = frame.to_image()
            buf = io.BytesIO()
            img.save(buf, format="JPEG")
            jpg_as_text = base64.b64encode(buf.getvalue()).decode('utf-8')

            payload = {
                "realtimeInput": {
                    "mediaChunks": [{
                        "mimeType": "image/jpeg",
                        "data": jpg_as_text
                    }]
                }
            }
            await ws.send(json.dumps(payload))
    except Exception as e:
        logger.info(f"Video forwarding ended: {e}")

async def forward_audio(ws, track):
    try:
        while True:
            frame = await track.recv()
            audio_bytes = frame.planes[0].to_bytes()
            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
            
            payload = {
                "realtimeInput": {
                    "mediaChunks": [{
                        "mimeType": f"audio/pcm;rate={frame.sample_rate}",
                        "data": audio_base64
                    }]
                }
            }
            await ws.send(json.dumps(payload))
    except Exception as e:
        logger.info(f"Audio forwarding ended: {e}")

async def gemini_session_manager(pc, custom_audio_track, video_track=None, audio_track=None):
    if not GEMINI_API_KEY:
        logger.error("❌ GEMINI_API_KEY not set in .env")
        return
        
    url = f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key={GEMINI_API_KEY}"
    logger.info("Attempting to connect to Gemini Multimodal Live API...")
    try:
        async with websockets.connect(url) as ws:
            logger.info("✅ Successfully connected to Gemini API WebSocket!")
            setup_msg = {
                "setup": {
                    "systemInstruction": {
                        "parts": [{
                            "text": "You are a ruthless, Socratic tutor. You are watching the user write notes and listening to them. DO NOT read their notes back to them. If they make a logical error in their drawing or logic, interrupt them immediately. Ask challenging follow-up questions. Keep responses under two sentences."
                        }]
                    }
                }
            }
            await ws.send(json.dumps(setup_msg))
            logger.info("✅ Sent Setup Message (Persona) to Gemini.")

            asyncio.create_task(gemini_ws_loop(ws, custom_audio_track))

            if video_track:
                asyncio.create_task(forward_video(ws, video_track))
            if audio_track:
                asyncio.create_task(forward_audio(ws, audio_track))

            while pc.connectionState not in ["closed", "failed"]:
                await asyncio.sleep(1)

    except Exception as e:
        logger.error(f"Gemini session error: {e}")

@app.post("/offer")
async def offer(params: Offer):
    offer_obj = RTCSessionDescription(sdp=params.sdp, type=params.type)
    
    pc = RTCPeerConnection()
    gemini_audio_track = CustomAudioTrack()
    pc.addTrack(gemini_audio_track)
    
    tracks = {"video": None, "audio": None}
    
    @pc.on("track")
    def on_track(track):
        logger.info(f"Track received: {track.kind}")
        if track.kind == "video":
            tracks["video"] = track
        elif track.kind == "audio":
            tracks["audio"] = track
            
        if tracks["video"] and tracks["audio"]:
            logger.info("Starting Gemini session manager")
            asyncio.ensure_future(gemini_session_manager(pc, gemini_audio_track, tracks["video"], tracks["audio"]))

    await pc.setRemoteDescription(offer_obj)
    
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    
    return {
        "sdp": pc.localDescription.sdp,
        "type": pc.localDescription.type
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
