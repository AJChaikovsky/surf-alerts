import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import './index.css'
import App from './App.tsx'

// Browsers change a focused number field's value when you scroll over it,
// which silently edits wave heights. Blur the field as the wheel starts so
// the wheel scrolls the page instead. One listener covers every number input.
document.addEventListener(
  'wheel',
  (event) => {
    const target = event.target

    if (
      target instanceof HTMLInputElement &&
      target.type === 'number' &&
      target === document.activeElement
    ) {
      target.blur()
    }
  },
  { passive: true },
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
