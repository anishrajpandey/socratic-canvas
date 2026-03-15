import React, { useRef, useEffect } from 'react';

export default function CanvasStream() {
  const canvasRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  
  // The React Trap Fix: 
  // We use useRef so that instantiating/storing streams does not
  // trigger a re-render or reset component state mid-draw.
  const mediaStreamRefs = useRef({ audio: null, video: null });
  const peerConnectionRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Match internal pixel resolution with actual layout size
    // to avoid blurry lines
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#38bdf8'; // Sky blue for visibility
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    isDrawing.current = true;
    lastPos.current = getPos(e);
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    
    const ctx = canvasRef.current.getContext('2d');
    const newPos = getPos(e);
    
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(newPos.x, newPos.y);
    ctx.stroke();
    
    lastPos.current = newPos;
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const startWebRTC = async (audioStream, videoStream) => {
    try {
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // Handle incoming remote tracks from Gemini
      pc.ontrack = (event) => {
        if (event.track.kind === 'audio' && remoteAudioRef.current) {
          console.log('✅ Received remote audio track from Gemini');
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      // Attach tracks
      if (audioStream) {
        audioStream.getTracks().forEach(track => pc.addTrack(track, audioStream));
      }
      if (videoStream) {
        videoStream.getTracks().forEach(track => pc.addTrack(track, videoStream));
      }

      // Create SDP Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // The API Call
      const response = await fetch('http://localhost:8000/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: pc.localDescription.sdp, type: pc.localDescription.type }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const answer = await response.json();
      
      // Set the SDP Answer
      await pc.setRemoteDescription(new RTCSessionDescription({ type: answer.type, sdp: answer.sdp }));
      console.log('✅ WebRTC Peer Connection Established!');
      
    } catch (err) {
      console.error("Failed to connect to signaling server. Is the Python backend running?", err);
      throw err;
    }
  };

  const startSession = async () => {
    try {
      console.log('Requesting microphone access...');
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRefs.current.audio = audioStream;
      console.log('✅ Captured Audio MediaStream:', audioStream);
      
      // Start local Speech-to-Text to log what the user is saying
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
          }
          console.log(`🗣️ You said: "${transcript.trim()}"`);
        };
        recognition.start();
        recognitionRef.current = recognition;
      } else {
        console.warn("SpeechRecognition API not supported in this browser. Can't log local transcript.");
      }
      
      const canvas = canvasRef.current;
      console.log('Extracting 1 FPS video stream from Native Canvas...');
      const videoStream = canvas.captureStream(1);
      mediaStreamRefs.current.video = videoStream;
      console.log('✅ Captured Video MediaStream:', videoStream);
      
      await startWebRTC(audioStream, videoStream);

      alert('Session start sequence complete! Check the browser console to verify MediaStreams.');
    } catch (err) {
      console.error('Failed to capture streams:', err);
      alert('Error fetching sensors: ' + err.message);
    }
  };

  return (
    <div className="flex flex-col items-center w-full h-full p-8 relative">
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
      <div className="w-full max-w-5xl flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-indigo-500">
            Real-Time Canvas Stream
          </h1>
          <p className="text-slate-400 mt-2">Draw on the canvas. Click Start Session to capture your stream.</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={clearCanvas}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            Clear Canvas
          </button>
          <button 
            onClick={startSession}
            className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            Start Session
          </button>
        </div>
      </div>
      
      <div className="w-full max-w-5xl flex-1 h-[70vh] bg-slate-800 rounded-2xl shadow-2xl overflow-y-auto border border-slate-700/50 relative">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          className="w-full h-[2000px] cursor-crosshair touch-none"
        />
      </div>
    </div>
  );
}
