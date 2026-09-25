import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './dashboard-final.css'
import './mobile-final.css'
import './scanner-batch.css'
import './location-sheets-final.css'
import './guide-logic-final.css'
import './commercial-final.css'
import './oc-observation-email.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let refreshing = false

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })

    void navigator.serviceWorker
      .register('/sw.js?v=4', { updateViaCache: 'none' })
      .then((registration) => {
        void registration.update()

        const refreshServiceWorker = () => {
          if (document.visibilityState === 'visible') {
            void registration.update()
          }
        }

        document.addEventListener('visibilitychange', refreshServiceWorker)
        window.setInterval(() => void registration.update(), 60 * 60 * 1000)
      })
      .catch(() => undefined)
  })
}
