import { useState } from 'react';
import CanvasStream from './components/CanvasStream';
import Landing from './components/Landing';

function App() {
  const [isStarted, setIsStarted] = useState(false);

  return (
    <main className="w-full h-screen bg-slate-900 flex flex-col items-center justify-center font-sans">
      {!isStarted ? (
        <Landing onStart={() => setIsStarted(true)} />
      ) : (
        <CanvasStream />
      )}
    </main>
  );
}

export default App;
