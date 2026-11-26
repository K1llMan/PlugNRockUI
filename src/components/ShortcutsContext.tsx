import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { type CommandItem, eventToShortcutString } from '../core/shortcutsUtils';

interface ShortcutsContextValue {
    commands: CommandItem[];
    customBindings: Record<string, string>;
    getEffectiveKey: (id: string) => string;
    updateKeybinding: (id: string, newKey: string) => void;
    resetKeybinding: (id: string) => void;
    tooltip: (id: string) => string;
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

export const ShortcutsProvider: React.FC<{
    initialCommands: CommandItem[];
    activeContexts?: string[]; // Например: ['editorFocus', 'modalOpen']
    children: React.ReactNode;
}> = ({ initialCommands, activeContexts = [], children }) => {
    const [customBindings, setCustomBindings] = useState<Record<string, string>>(() => {
        const saved = localStorage.getItem('user_keybindings');
        return saved ? JSON.parse(saved) : {};
    });

    const getEffectiveKey = useCallback(
        (id: string) => {
            if (customBindings[id] !== undefined) 
                return customBindings[id];
            return initialCommands.find((c) => c.id === id)?.defaultKey || '';
        },
        [customBindings, initialCommands]
    );

    const updateKeybinding = (id: string, newKey: string) => {
        setCustomBindings((prev) => {
            const updated = { ...prev, [id]: newKey };
            localStorage.setItem('user_keybindings', JSON.stringify(updated));
            return updated;
        });
    };

    const resetKeybinding = (id: string) => {
        setCustomBindings((prev) => {
            const updated = { ...prev };
            delete updated[id];
            localStorage.setItem('user_keybindings', JSON.stringify(updated));
            return updated;
        });
    };

    const tooltip = (id: string) => {
        const command = initialCommands.find((c) => c.id === id);
        if (!command)
            return ''

        const rawKey = getEffectiveKey(id);

        return `${command.title} (${rawKey})`
    }

    // Глобальный обработчик выполнения команд
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            // Не срабатываем, если пользователь печатает в input (кроме спец-команд)
            const target = e.target as HTMLElement;
            if (['INPUT', 'TEXTAREA'].includes(target.tagName) && !e.ctrlKey && !e.metaKey) {
                return;
            }

            const pressed = eventToShortcutString(e);
            if (!pressed) return;

            const matched = initialCommands.find((cmd) => {
                const keyMatches = getEffectiveKey(cmd.id) === pressed;
                const contextMatches = !cmd.when || activeContexts.includes(cmd.when);
                return keyMatches && contextMatches;
            });

            if (matched) {
                e.preventDefault();
                matched.action();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [initialCommands, getEffectiveKey, activeContexts]);

    return (
        <ShortcutsContext.Provider
            value={{ commands: initialCommands, customBindings, getEffectiveKey, updateKeybinding, resetKeybinding, tooltip }}
        >
            {children}
        </ShortcutsContext.Provider>
    );
};

export const useShortcuts = () => {
    const ctx = useContext(ShortcutsContext);
    if (!ctx) 
        throw new Error('useShortcuts must be used within ShortcutsProvider');
    return ctx;
};
