import React from 'react';

export default function Landing({ onStart }) {
  return (
    <div className="w-full h-screen bg-[#fdfbf7] flex flex-col items-center justify-center p-8 overflow-hidden relative font-sans">
      
      <div className="z-10 text-center max-w-4xl flex flex-col items-center">
        <h1 className="text-6xl md:text-8xl font-black text-slate-900 mb-6 tracking-tight drop-shadow-sm">
          Stop Typing. Start Learning.
        </h1>
        
        <p className="text-xl md:text-3xl text-slate-600 mb-16 font-medium max-w-3xl leading-relaxed">
          An AI tutor that watches you write and questions your logic in real-time.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16 w-full max-w-5xl">
          <div className="bg-white border border-slate-200 p-8 rounded-2xl text-center shadow-sm transition-transform hover:-translate-y-1">
            <div className="w-12 h-12 bg-slate-100 text-slate-900 rounded-full flex items-center justify-center mx-auto mb-6 text-xl font-bold">1</div>
            <h3 className="text-xl font-bold text-slate-800 mb-3">Draw your logic.</h3>
            <p className="text-slate-500">Sketch out math, diagrams, or notes on a limitless canvas.</p>
          </div>
          
          <div className="bg-white border border-slate-200 p-8 rounded-2xl text-center shadow-sm transition-transform hover:-translate-y-1">
            <div className="w-12 h-12 bg-slate-100 text-slate-900 rounded-full flex items-center justify-center mx-auto mb-6 text-xl font-bold">2</div>
            <h3 className="text-xl font-bold text-slate-800 mb-3">Speak your thoughts.</h3>
            <p className="text-slate-500">Think out loud as you work through the problem naturally.</p>
          </div>
          
          <div className="bg-white border border-slate-200 p-8 rounded-2xl text-center shadow-sm transition-transform hover:-translate-y-1">
            <div className="w-12 h-12 bg-slate-100 text-slate-900 rounded-full flex items-center justify-center mx-auto mb-6 text-xl font-bold">3</div>
            <h3 className="text-xl font-bold text-slate-800 mb-3">Get interrupted.</h3>
            <p className="text-slate-500">The tutor sees your screen and corrects mistakes instantly.</p>
          </div>
        </div>

        <button 
          onClick={onStart}
          className="px-10 py-4 bg-slate-900 text-white rounded-full font-bold text-xl transition-all hover:bg-slate-800 hover:shadow-xl active:scale-95 flex items-center gap-3 shadow-lg"
        >
          Enter the Notebook
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
