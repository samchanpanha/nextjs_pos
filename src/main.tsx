import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {registerPosServiceWorker} from './utils/offlineCache';

void registerPosServiceWorker();

createRoot(document.getElementById('root')!).render(<App />);
