import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { listenForInstallPrompt, registerServiceWorker } from './pwa.js'

listenForInstallPrompt()
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <SpeedInsights />
  </React.StrictMode>
)
