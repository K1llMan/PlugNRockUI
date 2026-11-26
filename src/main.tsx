import { createRoot } from 'react-dom/client';

import App from './App';
import { ShortcutsProvider } from './components/ShortcutsContext';

import { commands } from './core/commands';

import './css/styles.css';

createRoot(document.getElementById('root')!).render(
    <ShortcutsProvider initialCommands={commands}>
        <App />
    </ShortcutsProvider>
);