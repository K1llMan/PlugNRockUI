import IconCheckmark from '@/assets/checkmark.svg?react';
import IconChevronDown from '@/assets/chevron_down.svg?react';
import IconPlay from '@/assets/play.svg?react';
import IconPause from '@/assets/pause.svg?react';
import IconRestart from '@/assets/restart.svg?react';
import IconPrev from '@/assets/prev.svg?react';
import IconNext from '@/assets/next.svg?react';
import IconVolumeOn from '@/assets/volume-on.svg?react';
import IconVolumeOff from '@/assets/volume-off.svg?react';
import IconSpeed from '@/assets/speed.svg?react';
import IconLoop from '@/assets/loop.svg?react';
import IconClick from '@/assets/click.svg?react';
import IconSynth from '@/assets/synth.svg?react';
import IconTab from '@/assets/tab.svg?react';
import IconOpen from '@/assets/open.svg?react';
import IconGear from '@/assets/gear.svg?react';
import IconGuitar from '@/assets/guitar.svg?react';
import IconHeadstock from '@/assets/headstock.svg?react';
import IconStem from '@/assets/stem.svg?react';
import IconDrop from '@/assets/drop.svg?react';

export const IconMute = ({ on }: { on: boolean }) => on ? <IconVolumeOff /> : <IconVolumeOn />;

export {
    IconCheckmark, IconChevronDown,
    IconPlay, IconPause, IconRestart, IconPrev, IconNext, IconSpeed, IconLoop,
    IconClick, IconSynth, IconTab, IconOpen, IconGear, IconGuitar, IconHeadstock, IconStem, IconDrop
}