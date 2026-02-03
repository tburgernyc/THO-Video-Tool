import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("Fatal Error: DOM element with id 'root' not found.");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (err) {
    console.error("React Mount Error:", err);
    rootElement.innerHTML = `<div style="padding: 20px; color: red;"><h2>Application Failed to Start</h2><pre>${err}</pre></div>`;
  }
}