import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/nunito/wght.css';
import '@fontsource/pixelify-sans/700.css';
import './styles/index.css';
import { App } from './app/App';
import { installZoomGuard } from './app/preventZoom';
import { installPwa } from './app/pwa';

installZoomGuard();
installPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
