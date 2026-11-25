import React from 'react';

import '@/css/Slider.css';

export interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {

}

export const Slider: React.FC<SliderProps> = ({ min, max, value, onChange, ...props }) => {
    const ref = React.createRef<HTMLInputElement>();
    const getProgress = (val: number) => (val - min) / (max - min) * 100;
    const change = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!ref.current)
            return;

        ref.current.style.setProperty('--progress', `${getProgress(event.target.value)}%`);
        onChange?.(event);
    };

    return (<input 
        ref={ref}
        className="Slider" 
        style={{ ...props.style, '--progress': `${getProgress(value)}%` }}
        type="range"
        min={min} 
        max={max} 
        value={value} 
        onChange={change} 
    />);
}