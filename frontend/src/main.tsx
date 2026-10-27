import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Bundled fonts (installed at build time via @fontsource — no CDN links,
// so the app stays fully offline at runtime).
// Editorial pairing: Fraunces display serif + Archivo grotesk +
// JetBrains Mono telemetry (herbarium-ledger identity).
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/fraunces/600-italic.css';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/700.css';
import '@fontsource/jetbrains-mono/600.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
