import React, { useEffect } from 'react';

import '@/css/Checkbox.css';

export interface CheckboxProps extends React.HTMLAttributes<HTMLDivElement> {
    checked?: boolean,
    label?: string,
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export const Checkbox: React.FC<CheckboxProps> = ({ checked, label, onChange, ...props }) => {
    let checkbox = React.createRef<HTMLInputElement>();

    return (
        <label className={'Checkbox' + `${props.className ? ' ' + props.className : ''}`}>
            <input ref={checkbox} type="checkbox" checked={checked} onChange={onChange} />
            {label
                ? <span className='caption'>{label}</span>
                : null
            }            
            <span className="checkmark">
                <svg viewBox="0 0 26 26"><path className='path' fill="none" stroke="currentColor" d="M1.73,12.91 8.1,19.28 22.79,4.59"></path></svg>
            </span>
        </label>
    )
}