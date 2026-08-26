import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ensureLatestApp } from './ensure-latest-app'
import './register-sw'
import './styles.css'

async function start() {
  await ensureLatestApp()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
