import { createContext, useContext } from 'react';
import type { Snapshot, Item } from '../lib/types';
export interface Workspace {
    data: Snapshot;
    refresh: () => Promise<void>;
    notify: (message: string) => void;
    openItem: (item: Item | string) => void;
    navigate: (path: string) => void;
    capture: () => void;
    ask: (question: string, itemId?: string) => void;
    newReminder: (item?: Item) => void;
    confirm: (title: string, body: string, action: () => Promise<void>) => void;
}
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
    const value = useContext(WorkspaceContext);
    if (!value)
        throw new Error('Workspace unavailable');
    return value;
}
