import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <main className="page">
      <section className="card">
        <div className="eyebrow"><span className="dot" /> CLOUD FORGE · DEPLOYMENT TEST</div>
        <div className="rocket">🚀</div>
        <h1>It works!</h1>
        <p className="subtitle">Your React app has loaded successfully. If you can see this page at your CloudForge URL, the frontend deployment is working.</p>
        <div className="status"><span className="check">✓</span><div><strong>Frontend is running</strong><small>React + Vite · No backend required</small></div></div>
        <button onClick={() => setCount(v => v + 1)}>Test interaction <span>({count})</span></button>
        <p className="hint">Click the button to confirm JavaScript is working.</p>
      </section>
      <footer>Made for testing CloudForge deployments</footer>
    </main>
  );
}
