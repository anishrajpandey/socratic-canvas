import os
import io
import json
import base64
import logging
import asyncio
import fractions
import websockets
import av
import ssl
import certifi
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import MediaStreamTrack, MediaStreamError

load_dotenv(override=True)
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
        self.is_buffering = True
        self.min_buffer_size = 480 * 2 * 5  # 100ms cushion (5 frames)

    async def recv(self):
        while not self.queue.empty():
            try:
                self.buffer.extend(self.queue.get_nowait())
            except asyncio.QueueEmpty:
                break
                
        frame_size = self.samples_per_frame * 2

        if self.is_buffering:
            if len(self.buffer) < self.min_buffer_size:
                try:
                    chunk = await asyncio.wait_for(self.queue.get(), timeout=0.05)
                    self.buffer.extend(chunk)
                except asyncio.TimeoutError:
                    if len(self.buffer) > 0:
                        # We timed out waiting for more buffer, but we have some data.
                        # It might be a very short response. Stop buffering and play it.
                        self.is_buffering = False
            
            if len(self.buffer) >= self.min_buffer_size:
                self.is_buffering = False
            
            if self.is_buffering:
                return self._create_frame(bytes(frame_size))

        if len(self.buffer) < frame_size:
            try:
                chunk = await asyncio.wait_for(self.queue.get(), timeout=0.02)
                self.buffer.extend(chunk)
            except asyncio.TimeoutError:
                if len(self.buffer) > 0:
                    # Flush partial tail frame padded with silence
                    padded = self.buffer + bytearray(frame_size - len(self.buffer))
                    self.buffer.clear()
                    self.is_buffering = True  # reset to buffering state
                    return self._create_frame(padded)
                else:
                    self.is_buffering = True
                    return self._create_frame(bytes(frame_size))

        frame_bytes = self.buffer[:frame_size]
        self.buffer = self.buffer[frame_size:]
        return self._create_frame(frame_bytes)

    def _create_frame(self, frame_bytes):
        frame = av.AudioFrame(format='s16', layout='mono', samples=self.samples_per_frame)
        frame.planes[0].update(frame_bytes)
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
                msg = msg.decode('utf-8')
            response = json.loads(msg)
            logger.info(f"DEBUG Gemini msg keys: {list(response.keys())}")
            
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
                        elif "text" in part:
                            logger.info(f"🤖 Gemini Text: {part['text'].strip()}")
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
    except MediaStreamError:
        logger.info("Video track ended naturally.")
    except Exception as e:
        logger.exception("Video forwarding error:")

async def forward_audio(ws, track):
    resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)
    try:
        while True:
            frame = await track.recv()
            resampled_frames = resampler.resample(frame)
            for r_frame in resampled_frames:
                # Get the raw PCM bytes directly from the resampled frame array
                audio_bytes = r_frame.to_ndarray().tobytes()
                audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                
                payload = {
                    "realtimeInput": {
                        "mediaChunks": [{
                            "mimeType": "audio/pcm;rate=16000",
                            "data": audio_base64
                        }]
                    }
                }
                await ws.send(json.dumps(payload))
    except MediaStreamError:
        logger.info("Audio track ended naturally.")
    except Exception as e:
        logger.exception("Audio forwarding error:")

async def gemini_session_manager(pc, custom_audio_track, video_track=None, audio_track=None):
    if not GEMINI_API_KEY:
        logger.error("❌ GEMINI_API_KEY not set in .env")
        return
        
    url = f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key={GEMINI_API_KEY}"
    logger.info("Attempting to connect to Gemini Multimodal Live API...")
    try:
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        async with websockets.connect(url, ssl=ssl_context) as ws:
            logger.info("✅ Successfully connected to Gemini API WebSocket!")
            setup_msg = {
                "setup": {
                    "model": "models/gemini-2.5-flash-native-audio-preview-12-2025",
                    "systemInstruction": {
                        "parts": [{
                            "text": "You are a helpful, human-like study buddy and expert fact-checker. You must constantly watch the ENTIRE canvas screen. DO NOT WAIT FOR ME TO SPEAK. If you see me write an incorrect fact, logic error, or math mistake like '2*5=0' on the screen, you MUST SPEAK UP AND INTERRUPT ME IMMEDIATELY to correct it. Your primary job is to proactively guard the canvas against mistakes as I am actively writing them in real-time. Do not be polite about waiting your turn; just jump straight in and tell me it's wrong! If I do ask you a question, answer it concisely based on the full context of the notes on the screen."
                        }]
                    },
                    "generationConfig": {
                        "responseModalities": ["AUDIO"],
                        "speechConfig": {
                            "voiceConfig": {
                                "prebuiltVoiceConfig": {
                                    "voiceName": "Puck"
                                }
                            }
                        }
                    }
                }
            }
            await ws.send(json.dumps(setup_msg))
            logger.info("✅ Sent Setup Message (Persona) to Gemini.")

            initial_msg = {
                "clientContent": {
                    "turns": [{
                        "role": "user",
                        "parts": [{"text": "Hello! We are studying together. Please look at the entire canvas screen I'm sharing. Since you are my fact-checker, if you see me write a mistake, interrupt me! Otherwise, I'll just write my notes and ask you questions when I need help getting unstuck."}]
                    }],
                    "turnComplete": True
                }
            }
            await ws.send(json.dumps(initial_msg))
            logger.info("✅ Sent initial greeting prompt to trigger Gemini audio.")

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
