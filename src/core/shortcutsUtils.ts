export interface CommandItem {
    id: string;
    category: string;
    title: string;
    defaultKey: string; // Например: "Control+Shift+P" или "Meta+K"
    when?: string;      // Например: "editorFocus"
    action: () => void;
}

// Превращает KeyboardEvent в строку формата "Control+Shift+K"
export function eventToShortcutString(e: KeyboardEvent | React.KeyboardEvent): string | null {
    const ignoredKeys = ['Control', 'Shift', 'Alt', 'Meta'];
    if (ignoredKeys.includes(e.key)) 
        return null; // Ждем нажатия основной клавиши

    const parts: string[] = [];
    if (e.ctrlKey) 
        parts.push('Control');
    if (e.metaKey) 
        parts.push('Meta');
    if (e.altKey) 
        parts.push('Alt');
    if (e.shiftKey) 
        parts.push('Shift');

    const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    parts.push(key);

    return parts.join('+');
}
