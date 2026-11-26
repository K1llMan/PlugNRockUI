import React, { useState, useMemo } from 'react';
import { useShortcuts } from './ShortcutsContext';
import { type CommandItem, eventToShortcutString } from '../core/shortcutsUtils';

import '@/css/KeybindingsView.css';
import { useIntlayer } from 'react-intlayer';

const KeyBadges: React.FC<{ combo: string }> = ({ combo }) => {
    if (!combo) return <span className="kb-empty">—</span>;

    return (
        <span className="kb-badges">
            {combo.split('+').map((k, idx) => (
                <React.Fragment key={idx}>
                    {idx > 0 && <span>+</span>}
                    <kbd className="kb-kbd">{k}</kbd>
                </React.Fragment>
            ))}
        </span>
    );
};

export const KeybindingsView: React.FC = () => {
    const {
        commandTitle, keybindingTitle, whenTitle, sourceTitle, actionsTitle,
        buttonSearchMsg, commandSearchMsg, searchButtonHint, searchButtonTitle, resetButtonTitle,
        modalHint, modalError
    } = useIntlayer("commands");

    const { commands, customBindings, getEffectiveKey, updateKeybinding, resetKeybinding } = useShortcuts();
    const [search, setSearch] = useState('');
    const [recordSearchMode, setRecordSearchMode] = useState(false);
    const [editingCmd, setEditingCmd] = useState<CommandItem | null>(null);
    const [recordedKey, setRecordedKey] = useState<string>('');

    const filteredCommands = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q)
            return commands;

        return commands.filter((cmd) => {
            const effectiveKey = getEffectiveKey(cmd.id).toLowerCase();
            if (recordSearchMode) {
                return effectiveKey.includes(q);
            }
            return (
                cmd.title.toLowerCase().includes(q) ||
                cmd.category.toLowerCase().includes(q) ||
                effectiveKey.includes(q)
            );
        });
    }, [commands, search, recordSearchMode, getEffectiveKey]);

    const conflictingCommand = useMemo(() => {
        if (!recordedKey || !editingCmd) return null;
        return commands.find((c) => c.id !== editingCmd.id && getEffectiveKey(c.id) === recordedKey);
    }, [recordedKey, editingCmd, commands, getEffectiveKey]);

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!recordSearchMode) return;
        e.preventDefault();
        const combo = eventToShortcutString(e);
        if (combo) setSearch(combo);
    };

    const handleModalKeyDown = (e: React.KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'Escape') {
            setEditingCmd(null);
            return;
        }
        if (e.key === 'Enter' && recordedKey && editingCmd) {
            updateKeybinding(editingCmd.id, recordedKey);
            setEditingCmd(null);
            return;
        }

        const combo = eventToShortcutString(e);
        if (combo) setRecordedKey(combo);
    };

    return (
        <div className="kb-container">
            {/* Панель поиска */}
            <div className="kb-toolbar">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => !recordSearchMode && setSearch(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder={
                        recordSearchMode
                            ? buttonSearchMsg
                            : commandSearchMsg
                    }
                    className={`kb-search-input ${recordSearchMode ? 'kb-search-input--recording' : ''}`}
                />
                <button
                    onClick={() => {
                        setRecordSearchMode(!recordSearchMode);
                        setSearch('');
                    }}
                    title={searchButtonHint}
                    className={`kb-record-btn ${recordSearchMode ? 'kb-record-btn--active' : ''}`}
                >
                    {searchButtonTitle}
                </button>
            </div>

            {/* Таблица команд */}
            <table className="kb-table">
                <thead>
                    <tr>
                        <th>{commandTitle}</th>
                        <th>{keybindingTitle}</th>
                        <th>{whenTitle}</th>
                        <th>{sourceTitle}</th>
                        <th>{actionsTitle}</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredCommands.map((cmd) => {
                        const isCustom = customBindings[cmd.id] !== undefined;
                        const currentKey = getEffectiveKey(cmd.id);

                        return (
                            <tr
                                key={cmd.id}
                                className="kb-row"
                                onDoubleClick={() => {
                                    setEditingCmd(cmd);
                                    setRecordedKey(currentKey);
                                }}
                            >
                                <td className="kb-cell">
                                    <span className="kb-category">{cmd.category}: </span>
                                    <span className="kb-title">{cmd.title}</span>
                                </td>
                                <td className="kb-cell">
                                    <KeyBadges combo={currentKey} />
                                </td>
                                <td className="kb-cell kb-when">{cmd.when || '—'}</td>
                                <td className="kb-cell kb-source">{isCustom ? 'User' : 'Default'}</td>
                                <td className="kb-cell">
                                    {isCustom && (
                                        <button
                                            className="kb-reset-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                resetKeybinding(cmd.id);
                                            }}
                                        >
                                            {resetButtonTitle}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {/* Модальное окно переназначения клавиши */}
            {editingCmd && (
                <div
                    className="kb-modal-overlay"
                    onKeyDown={handleModalKeyDown}
                    tabIndex={0}
                    ref={(el) => el?.focus()}
                >
                    <div className="kb-modal">
                        <p className="kb-modal-hint">
                            {modalHint}
                        </p>
                        <div className="kb-modal-preview">
                            <KeyBadges combo={recordedKey} />
                        </div>
                        {conflictingCommand && (
                            <p className="kb-modal-warning">
                                {modalError} "{conflictingCommand.category}: {conflictingCommand.title}"
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
