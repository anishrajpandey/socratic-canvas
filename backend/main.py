import json
import logging
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from aiortc import RTCPeerConnection, RTCSessionDescription

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Critical CORS config for Vite React app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Offer(BaseModel):
    sdp: str
    type: str

async def consume_video(track):
    """Simple loop that reads video frames and prints to terminal."""
    try:
        while True:
            frame = await track.recv()
            print("Received video frame")
    except Exception as e:
        logger.info(f"Video track consumptio ended: {e}")

async def consume_audio(track):
    """Simple loop that reads audio frames and prints to terminal."""
    try:
        while True:
            chunk = await track.recv()
            print("Received audio chunk")
    except Exception as e:
        logger.info(f"Audio track consumption ended: {e}")

@app.post("/offer")
async def offer(params: Offer):
    offer_obj = RTCSessionDescription(sdp=params.sdp, type=params.type)
    
    pc = RTCPeerConnection()
    
    @pc.on("track")
    def on_track(track):
        logger.info(f"Track received: {track.kind}")
        
        if track.kind == "video":
            asyncio.ensure_future(consume_video(track))
        elif track.kind == "audio":
            asyncio.ensure_future(consume_audio(track))

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
