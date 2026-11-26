import React, { useState, useRef } from 'react';

import '@/css/Tabs.css';

export interface TabItem {
    id: string;
    label: string;
    icon?: React.ReactNode;
    content: React.ReactNode;
    disabled?: boolean;
}

interface TabsProps {
    items: TabItem[];
    variant?: 'primary' | 'secondary';
    defaultActiveId?: string;
    onChange?: (id: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({
    items,
    variant = 'primary',
    defaultActiveId,
    onChange,
}) => {
    const [activeId, setActiveId] = useState<string>(
        defaultActiveId || items[0]?.id || ''
    );
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const handleSelect = (id: string) => {
        setActiveId(id);
        onChange?.(id);
    };

    // Навигация стрелками для десктопа (по стандарту WAI-ARIA и MD3)
    const handleKeyDown = (e: KeyboardEvent, index: number) => {
        let nextIndex: number | null = null;

        if (e.key === 'ArrowRight') {
            nextIndex = (index + 1) % items.length;
        } else if (e.key === 'ArrowLeft') {
            nextIndex = (index - 1 + items.length) % items.length;
        } else if (e.key === 'Home') {
            nextIndex = 0;
        } else if (e.key === 'End') {
            nextIndex = items.length - 1;
        }

        if (nextIndex !== null) {
            e.preventDefault();
            // Пропускаем заблокированные табы, если они есть
            while (items[nextIndex]?.disabled && nextIndex !== index) {
                nextIndex =
                    e.key === 'ArrowLeft' || e.key === 'End'
                        ? (nextIndex - 1 + items.length) % items.length
                        : (nextIndex + 1) % items.length;
            }

            const nextTab = items[nextIndex];
            if (nextTab && !nextTab.disabled) {
                handleSelect(nextTab.id);
                tabRefs.current[nextIndex]?.focus();
            }
        }
    };

    const activeItem = items.find((item) => item.id === activeId);

    return (
        <div className="Tabs">
            <div
                role="tablist"
                aria-orientation="horizontal"
                className={`tablist tablist--${variant}`}
            >
                {items.map((item, index) => {
                    const isActive = item.id === activeId;

                    return (
                        <button
                            key={item.id}
                            ref={(el) => {
                                tabRefs.current[index] = el;
                            }}
                            role="tab"
                            type="button"
                            id={`tab-${item.id}`}
                            aria-selected={isActive}
                            aria-controls={`panel-${item.id}`}
                            tabIndex={isActive ? 0 : -1}
                            disabled={item.disabled}
                            onClick={() => handleSelect(item.id)}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            className={`tab ${isActive ? 'tab--active' : ''}`}
                        >
                            <span className="tab__state-layer" />

                            <span className="tab__content">
                                {item.icon && <span className="tab__icon">{item.icon}</span>}
                                <span className="tab__label">{item.label}</span>
                            </span>

                            {/* Индикатор активного таба */}
                            {isActive && (
                                <span
                                    className={`tab__indicator tab__indicator--${variant}`}
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Область контента */}
            {activeItem && (
                <div
                    role="tabpanel"
                    id={`panel-${activeItem.id}`}
                    aria-labelledby={`tab-${activeItem.id}`}
                    tabIndex={0}
                    className="tabpanel"
                >
                    {activeItem.content}
                </div>
            )}
        </div>
    );
};
