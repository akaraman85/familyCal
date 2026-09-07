import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DisplaySettingsProvider } from './display-settings'
import { ThemeProvider } from './theme'
import './register-sw'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <DisplaySettingsProvider>
        <App />
      </DisplaySettingsProvider>
    </ThemeProvider>
  </StrictMode>,
)
