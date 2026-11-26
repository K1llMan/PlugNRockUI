import React, { useState, useEffect } from 'react';

import { combineClassNames } from '../core/util';
import { KeyboardKey } from '../core/keyboardKeys';

import '@/css/Select.css';
import { IconChevronDown } from '../ui/Icons';

export interface SelectOption {
    name: string,
    value: any,
}

export interface SelectProps extends React.HTMLAttributes<HTMLDivElement> {
    options: SelectOption[],
    selectedOption: any,
    placeholder?: string,
    disabled?: boolean,
    selectFirst?: boolean,
    onChange?: (value: any) => void
}

export const Select: React.FC<SelectProps> = ({ options, selectedOption, placeholder, disabled, selectFirst, onChange, ...props }) => {
    const [showOptions, setShowOptions] = useState(false);
    let optionList = React.createRef<HTMLDivElement>();
    let onMouseOverOptions = false;

    let show = (e: Event, isShow: boolean) => {
        e.preventDefault();

        if (optionList.current)
            optionList.current.scroll(0, 0);
        setShowOptions(isShow);
    }

    let change = (e: Event, value: any) => {
        onChange?.(value);

        show(e, false);
    }

    let getSelectedOption = () => {
        if (!options)
            return '';

        let filtered = options.filter(o => o.value == selectedOption);
        if (filtered.length == 0)
            if (options.length > 0 && selectFirst) {
                onChange?.(options[0].value);
                return options[0].name;
            }
            else
                return placeholder || '';
        return filtered[0].name;
    }

    useEffect(() => {
        let list: HTMLDivElement | null = optionList.current;
        if (list == null)
            return;

        if (showOptions) {
            let topOffset = 2;

            let parent: HTMLElement | null = list.parentElement;

            if (parent == null)
                return;

            list.style.left = `${parent.offsetLeft}px`;
            list.style.width = `${parent.offsetWidth}px`;

            let maxHeight = 200;
            let top = parent.offsetTop + parent.offsetHeight + topOffset;
            if (top + list.offsetHeight > document.body.offsetHeight)
                top = parent.offsetTop - (Math.min(list.offsetHeight, maxHeight) + topOffset);

            list.style.top = `${top}px`;
        }
        else
            list.style.top = `0`;

        list.style.visibility = showOptions ? 'visible' : 'hidden';
    }, [showOptions]);

    // Обработка клавиатуры
    let onKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case KeyboardKey.Escape:
                show(e, false);
                break;
        }
    }

    return (
        <div tabIndex={0} style={props.style} className={combineClassNames(['Select', disabled ? 'disabled' : '', props.className ? props.className : ''])}
            onKeyDown={onKeyDown} onBlur={(e) => !onMouseOverOptions ? show(e, false) : null}>
            <div className='selectBox' onClick={(e) => show(e, !showOptions)}>
                <div className='header'>{getSelectedOption()}</div>
                <div className={'arrow' + (showOptions ? ' show' : '')}><IconChevronDown /></div>
            </div>
            <div ref={optionList} className={combineClassNames(['options', showOptions ? 'show' : ''])} onMouseOver={() => onMouseOverOptions = true}
                onMouseLeave={() => onMouseOverOptions = false}>
                <div className='options-content'>
                    {options
                        ? options.map((o: any, i: number) =>
                            <div key={i} className={combineClassNames(['opt', o.value == selectedOption ? 'selected' : ''])} onClick={(e) => change(e, o.value)}>
                                <div className='value'>{o.name}</div>
                            </div>)
                        : null
                    }
                </div>
            </div>
        </div>
    )
}