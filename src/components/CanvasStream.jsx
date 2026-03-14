import React, { useRef, useEffect } from 'react';

export default function CanvasStream() {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  
  // The React Trap Fix: 
  // We use useRef so that instantiating/storing streams does not
  // trigger a re-render or reset component state mid-draw.
  const mediaStreamRefs = useRef({ audio: null, video: null });

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

  const startSession = async () => {
    try {
      console.log('Requesting microphone access...');
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRefs.current.audio = audioStream;
      console.log('✅ Captured Audio MediaStream:', audioStream);
      
      const canvas = canvasRef.current;
      console.log('Extracting 1 FPS video stream from Native Canvas...');
      const videoStream = canvas.captureStream(1);
      mediaStreamRefs.current.video = videoStream;
      console.log('✅ Captured Video MediaStream:', videoStream);
      
      alert('Session start sequence complete! Check the browser console to verify MediaStreams.');
    } catch (err) {
      console.error('Failed to capture streams:', err);
      alert('Error fetching sensors: ' + err.message);
    }
  };

  return (
    <div className="flex flex-col items-center w-full h-full p-8 relative">
      <div className="w-full max-w-5xl flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-indigo-500">
            Real-Time Canvas Stream
          </h1>
          <p className="text-slate-400 mt-2">Draw on the canvas. Click Start Session to capture your stream.</p>
        </div>
        <button 
          onClick={startSession}
          className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          Start Session
        </button>
      </div>
      
      <div className="w-full max-w-5xl flex-1 max-h-[70vh] bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-700/50">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          className="w-full h-full cursor-crosshair touch-none"
        />
      </div>
    </div>
  );
}
