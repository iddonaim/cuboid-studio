import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ThumbnailGenerator from './components/tools/ThumbnailGenerator';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Check for ?thumbnails query param to show generator
const params = new URLSearchParams(window.location.search);
const showThumbnails = params.has('thumbnails');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {showThumbnails ? <ThumbnailGenerator /> : <App />}
  </React.StrictMode>
);
