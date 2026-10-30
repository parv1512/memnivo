export const ITEM_TYPES = ['note', 'article', 'video', 'repository', 'context', 'document', 'code'] as const;
export type ItemType = typeof ITEM_TYPES[number];
export const ITEM_STATUSES = ['inbox', 'saved', 'in_progress', 'completed', 'archived'] as const;
export type ItemStatus = typeof ITEM_STATUSES[number];
export interface Item {
    id: string;
    type: ItemType;
    title: string;
    url: string | null;
    source: string;
    content: string;
    summary: string;
    note: string;
    reason: string;
    status: ItemStatus;
    sensitivity: 'normal' | 'private';
    favorite: boolean;
    projectId: string | null;
    tags: string[];
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    contentHash: string;
    archivedAt: string | null;
}
export interface Project {
    id: string;
    name: string;
    description: string;
    goal: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    itemCount: number;
    taskCount: number;
    completedCount: number;
}
export interface Task {
    id: string;
    title: string;
    description: string;
    status: 'open' | 'in_progress' | 'completed' | 'dismissed';
    priority: 'low' | 'normal' | 'high';
    dueAt: string | null;
    projectId: string | null;
    itemId: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface Reminder {
    id: string;
    title: string;
    note: string;
    itemId: string | null;
    taskId: string | null;
    dueAt: string;
    timezone: string;
    status: 'upcoming' | 'snoozed' | 'completed' | 'dismissed';
    snoozedUntil: string | null;
    recurrence: 'none' | 'daily' | 'weekly';
    lastNotifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface Notification {
    id: string;
    reminderId: string | null;
    title: string;
    body: string;
    createdAt: string;
    readAt: string | null;
}
export interface Citation {
    itemId: string;
    title: string;
    excerpt: string;
    score: number;
    createdAt: string;
    url: string | null;
    methods: string[];
}
export interface Message {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
    citations: Citation[];
    mode: string;
    feedback: number | null;
}
export interface Conversation {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
}
export interface Relationship {
    id: string;
    sourceId: string;
    targetId: string;
    type: string;
    origin: 'user' | 'ai';
    confidence: number;
    createdAt: string;
}
export interface VaultConnection {
    id: string;
    name: string;
    includes: string[];
    excludes: string[];
    status: string;
    lastSync: string | null;
    noteCount: number;
    error: string | null;
    pending: number;
}
export interface VaultLog {
    id: string;
    kind: string;
    message: string;
    createdAt: string;
}
export interface Preferences {
    displayName: string;
    appName: string;
    theme: 'dark' | 'light' | 'system';
    timezone: string;
    onboarded: boolean;
    aiConsent: boolean;
    aiSuggestions: boolean;
    maxReminders: number;
    snoozeMinutes: number;
    quietStart: string;
    quietEnd: string;
    desktopNotifications: boolean;
    dailyReview: boolean;
}
export interface ProviderStatus {
    provider: string;
    configured: boolean;
    model: string;
    embeddingModel: string;
    baseUrl: string;
    consent: boolean;
}
export interface Activity {
    id: string;
    itemId: string | null;
    action: string;
    createdAt: string;
}
export interface Snapshot {
    items: Item[];
    projects: Project[];
    tasks: Task[];
    reminders: Reminder[];
    notifications: Notification[];
    preferences: Preferences;
    vault: VaultConnection | null;
    vaultLogs: VaultLog[];
    relationships: Relationship[];
    provider: ProviderStatus;
    conversations: Conversation[];
    savedSearches: {
        id: string;
        name: string;
        query: string;
    }[];
    worker: {
        lastSeen: string | null;
        running: boolean;
    };
}
