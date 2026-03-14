Socratic Canvas: Real-Time Multimodal AI Tutor
Socratic Canvas is a proactive, multimodal learning interface designed to break the "illusion of competence" in technical subjects. Unlike traditional AI tutors that wait for a student to ask a question, Socratic Canvas uses a live WebRTC pipeline to watch a student's handwriting and listen to their reasoning in real-time, interrupting with Socratic questioning the moment a logical or structural error occurs.

Built for the Gemini Live Agent Hackathon, this project leverages the Gemini Multimodal Live API to bridge the gap between physical motor skills (writing/drawing) and cognitive recall.

The Problem
Most AI education tools are reactive. You finish your notes, then you ask the AI to summarize them. This allows students to internalize mistakes long before they are corrected. High-stakes technical learning (System Design, Calculus, Data Structures) requires a Proactive Peer—someone who watches the "pen hit the paper" and challenges your logic while you are in the flow state.

Features
Live Drawing Synchronization: A low-latency HTML5 Canvas feed captured at 1-fps to provide the AI with constant visual context.

Proactive Interruption: Utilizing the Gemini Live API's interruptible audio, the agent stops the user mid-sentence or mid-stroke if it detects a violation of first principles.

Socratic Pedagogy: The agent is hard-coded to never give the answer. It only asks the "next best question" to guide the user toward self-discovery.

Hardware-Agnostic: Designed for tablets and styluses to simulate the physical experience of a whiteboard technical interview.

Tech Stack
Frontend: React.js, HTML5 Canvas API, WebRTC (MediaStream)

Backend: Python, FastAPI, aiortc (WebRTC implementation)

AI Engine: Gemini 2.0 Flash (via Multimodal Live API WebSockets)

Infrastructure: Google Cloud Run (Dockerized)
 
Architecture
The system bypasses traditional HTTP polling to maintain a sub-second feedback loop:

Capture: The browser captures the Canvas element as a video track and the microphone as an audio track.

Transport: Tracks are piped via WebRTC to a Python backend to handle NAT traversal and low-latency delivery.

Processing: The backend extracts frames and buffers PCM audio chunks.

Inference: Data is streamed via WebSockets to the Gemini Live API.

Feedback: Gemini’s audio response is routed back through the WebRTC data channel to the user’s headset.

Getting Started
Prerequisites
Python 3.10+

Node.js & NPM

Google Cloud Project with Gemini API access

Installation
Clone the repo:

Bash
git clone https://github.com/your-username/live-canvas-agent.git
cd live-canvas-agent
Backend Setup:

Bash
cd backend
pip install -r requirements.txt
python main.py
Frontend Setup:

Bash
cd frontend
npm install
npm start