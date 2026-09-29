import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@ecl/preset-eu/dist/styles/optional/ecl-reset.css'
import '@ecl/preset-eu/dist/styles/ecl-eu.css'
import '@ecl/preset-eu/dist/styles/optional/ecl-eu-default.css'
import './index.css'
import App from './App.tsx'
import { preloadOwnHighcharts } from './components/charts/ownHighcharts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Where Europa Webtools refuses the domain, the fallback charts load while the data is fetched.
preloadOwnHighcharts()
