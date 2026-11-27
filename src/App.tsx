import { useEffect, useRef } from 'react';
import { useIntlayer } from 'react-intlayer';

import Stage from './ui/Stage';
import TabView from './ui/TabView';
import Bar from './ui/Bar';
import Options from './ui/Options';
import { useUi } from './core/store';
import { useGlobalInput } from './ui/hooks';
import { boot } from './core/session';
import { openDropped, registerFileInput } from './core/files';
import { inputLocked } from './core/store';
import type { DroppedFile } from './types';

let booted = false;
export default function App() {
  const { appName, dropSong, dropMessage } = useIntlayer("common");

  const locked = useUi((s) => s.locked); 
  const title = useUi((s) => s.title); 
  const has = useUi((s) => s.hasSong); 
  const drop = useUi((s) => s.dropActive);

  const pick = useRef<HTMLInputElement>(null);

  useGlobalInput();

  useEffect(() => { registerFileInput(pick.current); return () => registerFileInput(null); }, []);
  useEffect(() => { document.body.classList.toggle('locked', locked); }, [locked]);
  useEffect(() => { document.title = (has && title ? title + ' - ' : '') + appName; }, [title, has]);
  useEffect(() => { if (booted) return; booted = true; void boot(); }, []);

  return <>
    <Stage>
      <TabView />
    </Stage>
    <Bar />
    <Options />
    <div id="drop" className={drop ? 'show' : ''}>
      <div>{dropSong}
        <small>{dropMessage}</small>
      </div>
    </div>
    <input id="filePick" ref={pick} type="file" multiple hidden
      onChange={(e) => { 
        const f = [...(e.currentTarget.files || [])] as DroppedFile[]; 
        if (f.length && !inputLocked()) 
          void openDropped(f); 
        }
      } />
  </>;
}