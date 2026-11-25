import React from 'react';

import { IconCheckmark } from '../ui/Icons';

import '@/css/Checkbox.css';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, checked, onChange, ...props }) => {
    let checkbox = React.createRef<HTMLInputElement>();

    return (
        <label className={'Checkbox' + `${props.className ? ' ' + props.className : ''}`}>
            <input ref={checkbox} type="checkbox" checked={checked} onChange={onChange} />
            {label
                ? <span className='caption'>{label}</span>
                : null
            }            
            <span className="checkmark">
                <IconCheckmark />
            </span>
        </label>
    )
}