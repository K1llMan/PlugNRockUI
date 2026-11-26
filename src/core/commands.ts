import { getIntlayer } from "intlayer";

import type { CommandItem } from "./shortcutsUtils";
import { KeyboardKey } from "./keyboardKeys";
import { ui } from "./store";
import { seek, togglePlay } from "./audio";
import { applyOffset, sectionAt, selectArrangement } from "./chart";
import { STATE } from "./state";
import { setPref } from "./prefs";

const commandTitles = getIntlayer('commands');

const commands: CommandItem[] = [
    {
        id: 'options',
        category: '',
        title: commandTitles.options,
        defaultKey: KeyboardKey.KeyO,
        when: undefined,
        action: () => { ui.set({ cfgOpen: !ui.get().cfgOpen }) }
    },
    {
        id: 'playPause',
        category: '',
        title: commandTitles.playPause,
        defaultKey: KeyboardKey.Space,
        when: undefined,
        action: togglePlay
    },
    {
        id: 'restart',
        category: '',
        title: commandTitles.restart,
        defaultKey: KeyboardKey.KeyR,
        when: undefined,
        action: () => seek(0)
    },
    {
        id: 'prevSection',
        category: '',
        title: commandTitles.prevSection,
        defaultKey: KeyboardKey.BracketLeft,
        when: undefined,
        action: () => {
            const s = sectionAt(STATE.time - 0.25);
            seek(s ? (s.start > STATE.time - 0.6 ? (sectionAt(s.start - 0.1) || s).start : s.start) : 0);
        }
    },
    {
        id: 'nextSection',
        category: '',
        title: commandTitles.nextSection,
        defaultKey: KeyboardKey.BracketRight,
        when: undefined,
        action: () => {
            const s = sectionAt(STATE.time + 0.05);
            if (s && s.idx + 1 < STATE.sections.length)
                seek(STATE.sections[s.idx + 1].time);
        }
    },
    {
        id: 'loopSection',
        category: '',
        title: commandTitles.loopSection,
        defaultKey: KeyboardKey.KeyL,
        when: undefined,
        action: () => {
            document.getElementById('bLoop')?.click();
        }
    },
    {
        id: 'tabView',
        category: '',
        title: commandTitles.tabView,
        defaultKey: KeyboardKey.KeyT,
        when: undefined,
        action: () => {
            setPref('tabView', !STATE.tabView);
        }
    },
    {
        id: 'mute',
        category: '',
        title: commandTitles.mute,
        defaultKey: KeyboardKey.KeyM,
        when: undefined,
        action: () => {
            setPref('muted', !STATE.muted);
        }
    },
    {
        id: 'metronome',
        category: '',
        title: commandTitles.metronome,
        defaultKey: KeyboardKey.KeyC,
        when: undefined,
        action: () => {
            setPref('clickOn', !STATE.clickOn);
        }
    },
    {
        id: 'noteSynth',
        category: '',
        title: commandTitles.noteSynth,
        defaultKey: KeyboardKey.KeyN,
        when: undefined,
        action: () => {
            setPref('synthOn', !STATE.synthOn);
        }
    },
    {
        id: 'stepBackward',
        category: '',
        title: commandTitles.stepBackward,
        defaultKey: KeyboardKey.ArrowLeft,
        when: undefined,
        action: () => {
            seek(STATE.time - 1);
        }
    },
    {
        id: 'fastStepBackward',
        category: '',
        title: commandTitles.fastStepBackward,
        defaultKey: `${KeyboardKey.Shift}+${KeyboardKey.ArrowLeft}`,
        when: undefined,
        action: () => {
            seek(STATE.time - 5);
        }
    },
    {
        id: 'stepForward',
        category: '',
        title: commandTitles.stepForward,
        defaultKey: KeyboardKey.ArrowRight,
        when: undefined,
        action: () => {
            seek(STATE.time + 1);
        }
    },
    {
        id: 'fastStepForward',
        category: '',
        title: commandTitles.fastStepBackward,
        defaultKey: `${KeyboardKey.Shift}+${KeyboardKey.ArrowRight}`,
        when: undefined,
        action: () => {
            seek(STATE.time + 5);
        }
    },
    {
        id: 'offsetPlus',
        category: '',
        title: commandTitles.offsetPlus,
        defaultKey: KeyboardKey.Period,
        when: undefined,
        action: () => {
            applyOffset(STATE.offMs + 1);
        }
    },
    {
        id: 'offsetMinus',
        category: '',
        title: commandTitles.offsetMinus,
        defaultKey: KeyboardKey.Comma,
        when: undefined,
        action: () => {
            applyOffset(STATE.offMs - 1);
        }
    }
];

for (let k = 1; k < 7; k++)
    commands.push(
        {
            id: `arrangement${k}`,
            category: '',
            title: `${commandTitles.arrangement} ${k}` ,
            defaultKey: k.toString(),
            when: undefined,
            action: () => {
                const i = +k - 1; if (i < STATE.arrs.length) 
                    selectArrangement(i);
            }
        }
    );

export { commands };