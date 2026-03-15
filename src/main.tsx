import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import posthog from 'posthog-js'
import './index.css'
import App from './App.tsx'

posthog.init('phc_2s97xZI2zfBESk42rNcPJy4HQSPrFa6grNLkoHtxje7', {
  api_host: 'https://us.i.posthog.com',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
