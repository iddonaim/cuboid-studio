import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ThumbnailGenerator from './components/tools/ThumbnailGenerator';
import AxonometricGenerator from './components/tools/AxonometricGenerator';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Check for query params to show alternate tool routes.
const params = new URLSearchParams(window.location.search);
const showThumbnails = params.has('thumbnails');
const showAxon = params.has('axon');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {showAxon ? <AxonometricGenerator /> : showThumbnails ? <ThumbnailGenerator /> : <App />}
  </React.StrictMode>
);
