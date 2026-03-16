import React, { useRef, useEffect, useState } from 'react';

export default function CanvasStream() {
  const canvasRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [isErasing, setIsErasing] = useState(false);
  
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
    
    if (isErasing) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 30;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#38bdf8';
    }
    
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
        recognition.onerror = (event) => {
          console.error("Speech recognition error:", event.error);
        };
        recognition.onend = () => {
          console.log("Speech recognition ended. Restarting...");
          setTimeout(() => {
            try { recognition.start(); } catch (e) {}
          }, 1000);
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
      console.log('✅ Session start sequence complete! Check the browser console to verify MediaStreams.');
    } catch (err) {
      console.error('Failed to capture streams:', err);
      alert('Error fetching sensors: ' + err.message);
    }
  };

  return (
    <div className="flex flex-col items-center w-full h-full p-6 sm:p-12 relative bg-[#fdfbf7]">
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
      
      {/* Floating Toolbar */}
      <div className="fixed bottom-10 z-50 flex items-center gap-4 bg-white/80 backdrop-blur-lg px-8 py-4 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-slate-200/50">
        <button 
          onClick={() => setIsErasing(false)}
          className={`px-5 py-2.5 rounded-full font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer ${!isErasing ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'bg-transparent hover:bg-slate-100 text-slate-500'}`}
        >
          🖊️ Pen
        </button>
        <button 
          onClick={() => setIsErasing(true)}
          className={`px-5 py-2.5 rounded-full font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer ${isErasing ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'bg-transparent hover:bg-slate-100 text-slate-500'}`}
        >
          🧽 Eraser
        </button>
        <div className="w-px h-8 bg-slate-200 mx-1"></div>
        <button 
          onClick={clearCanvas}
          className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          Clear Ink
        </button>
        <button 
          onClick={startSession}
          className="relative group px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-bold shadow-lg shadow-indigo-500/30 transition-all hover:scale-105 active:scale-95 cursor-pointer overflow-hidden"
        >
          <div className="absolute inset-0 w-full h-full bg-white opacity-0 group-hover:opacity-20 animate-pulse"></div>
          <span className="relative flex items-center gap-2">
            Start Live Tutor
            <div className="w-2 h-2 rounded-full bg-red-400 animate-ping"></div>
          </span>
        </button>
      </div>

      <div className="w-full max-w-5xl mb-8 flex justify-between items-end px-4">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tight">
            Study Notebook
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Jot down your notes. The tutor is watching the page.</p>
        </div>
      </div>
      
      {/* Notebook Paper Container */}
      <div 
        className="w-full max-w-5xl flex-1 bg-white rounded-r-2xl rounded-l-md shadow-[0_20px_50px_rgba(0,0,0,0.05)] overflow-y-auto relative border-y border-r border-l-4 border-slate-200 border-l-slate-300"
        style={{
          backgroundImage: 'linear-gradient(transparent 95%, #e2e8f0 100%)',
          backgroundSize: '100% 2rem',
          backgroundAttachment: 'local'
        }}
      >
        {/* Red Margin Line */}
        <div className="absolute left-16 top-0 bottom-0 w-0.5 bg-red-400/30 pointer-events-none z-10 hidden sm:block"></div>
        {/* Binder Holes */}
        <div className="absolute left-4 top-10 w-4 h-4 rounded-full bg-[#fdfbf7] shadow-inner border border-slate-200 pointer-events-none z-10"></div>
        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#fdfbf7] shadow-inner border border-slate-200 pointer-events-none z-10"></div>
        <div className="absolute left-4 bottom-10 w-4 h-4 rounded-full bg-[#fdfbf7] shadow-inner border border-slate-200 pointer-events-none z-10"></div>
        
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          className="w-full h-[2000px] cursor-crosshair touch-none relative z-20 mix-blend-multiply"
        />
      </div>
    </div>
  );
}
