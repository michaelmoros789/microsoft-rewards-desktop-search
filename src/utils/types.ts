/**
 * Type definitions for message payloads used in Chrome extension communication
 */

export interface ClearBookmarksPayload {
    /** Number of bookmarks to create */
    bookmarkCount: number;
    /** Base URL for Bing search bookmarks */
    baseUrl: string;
}

export interface ClearBookmarksMessage {
    action: 'clear-bookmarks';
    payload: ClearBookmarksPayload;
}

export interface AbortTaskMessage {
    action: 'abortTask';
}

export interface StartBookmarkAutomationMessage {
    action: 'startBookmarkAutomation';
}

export type ExtensionMessage =
    | ClearBookmarksMessage
    | AbortTaskMessage
    | StartBookmarkAutomationMessage;
