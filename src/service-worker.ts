/// <reference types="chrome" />

import { getStorageItem } from "./utils/storage";
import { config } from "./config";
import { MicrosoftRewardsBookmarks } from "./utils/bookmark";
import { keywords } from "./utils/keywords";
import { getUniqueWords } from "./utils/keyword";

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface Task {
    type: string;
    tabId?: number;
    intervalId?: ReturnType<typeof setInterval>;
    timeoutId?: ReturnType<typeof setTimeout>;
}

interface MessageResponse {
    success?: boolean;
    message?: string;
    status?: string;
    action?: string;
    timestamp?: number;
    stack?: string;
    taskType?: string;
}

// ============================================================================
// GLOBAL STATE
// ============================================================================

let currentTask: Task | null = null;
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;



// ============================================================================
// KEEP-ALIVE MANAGER
// ============================================================================

class KeepAliveManager {
    static start(): void {
        // Create a periodic alarm to keep the service worker active
        chrome.alarms.create('keepAlive', { periodInMinutes: 1 });

        // Also use setInterval as a backup
        if (!keepAliveInterval) {
            keepAliveInterval = setInterval(() => {
                console.log('🔄 Service worker keep-alive heartbeat');
            }, 30000); // Every 30 seconds
        }
    }

    static stop(): void {
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
            console.log('🧹 Cleaned up keep-alive interval');
        }

        // Clear the alarm
        chrome.alarms.clear('keepAlive').catch(error => {
            console.error('Failed to clear keep-alive alarm:', error);
        });
    }

    static handleAlarm(alarm: chrome.alarms.Alarm): void {
        if (alarm.name === 'keepAlive') {
            console.log('🔄 Keep-alive alarm triggered');
        }
    }
}

// ============================================================================
// TASK MANAGER
// ============================================================================

class TaskManager {
    static startTask(type: string): void {
        // Check if there's already a task running
        if (currentTask) {
            console.log("⚠️ Task already in progress, aborting current task");
            this.abortTask();
        }

        currentTask = { type };
        console.log(`🔄 Starting task: ${type}`);
    }

    static abortTask(): void {
        if (!currentTask) return;

        console.log(`🛑 Aborting task: ${currentTask.type}`);

        // Clear any intervals or timeouts
        if (currentTask.intervalId) {
            clearInterval(currentTask.intervalId);
            console.log('⏹️ Cleared interval');
        }

        if (currentTask.timeoutId) {
            clearTimeout(currentTask.timeoutId);
            console.log('⏹️ Cleared timeout');
        }

        // Close the tab if it was created
        if (currentTask.tabId) {
            chrome.tabs.remove(currentTask.tabId, () => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to close tab:', chrome.runtime.lastError);
                } else {
                    console.log('✅ Tab closed successfully');
                }
            });
        }

        currentTask = null;
        console.log('✅ Task aborted successfully');
    }

    static isTaskRunning(): boolean {
        return currentTask !== null;
    }

    static getCurrentTask(): Task | null {
        return currentTask;
    }

    static setTaskTimeout(timeoutId: ReturnType<typeof setTimeout>): void {
        if (currentTask) {
            currentTask.timeoutId = timeoutId;
        }
    }
}

// ============================================================================
// PROGRESS TRACKER
// ============================================================================

class ProgressTracker {
    static sendProgressUpdate(currentIndex: number, totalBookmarks: number): void {
        chrome.runtime.sendMessage({
            action: "automation-progress-update",
            currentIndex,
            totalBookmarks
        }).catch(error => {
            // Only log error if it's not a connection error (popup closed)
            if (!error.message.includes('Receiving end does not exist')) {
                console.error('Failed to send progress update:', error);
            }
        });
    }

    static sendCompletionMessage(action: string): void {
        chrome.runtime.sendMessage({
            status: "done",
            action
        }).catch(error => {
            console.error('Failed to send completion message:', error);
        });
    }

    static sendBatchPause(currentIndex: number, totalBookmarks: number, pauseDuration: number): void {
        chrome.runtime.sendMessage({
            action: "batch-pause",
            currentIndex,
            totalBookmarks,
            pauseDuration
        }).catch(error => {
            // Only log error if it's not a connection error (popup closed)
            if (!error.message.includes('Receiving end does not exist')) {
                console.error('Failed to send batch pause message:', error);
            }
        });
    }
}

// ============================================================================
// BOOKMARK AUTOMATION
// ============================================================================

class BookmarkAutomation {
    static async start(): Promise<void> {
        TaskManager.startTask('start');

        try {
            await this.processBookmarks();
        } catch (error) {
            console.error('❌ Error in bookmark automation:', error);
            ProgressTracker.sendCompletionMessage('start');
        }
    }

    private static async processBookmarks(): Promise<void> {
        return new Promise((resolve, reject) => {
            chrome.bookmarks.getChildren("1", (barItems) => {
                const rewardsFolder = barItems.find(
                    (item) => item.title === "Microsoft Rewards" && !item.url
                );

                if (!rewardsFolder) {
                    console.warn("❌ 'Microsoft Rewards' folder not found in Bookmarks Bar");
                    ProgressTracker.sendCompletionMessage('start');
                    resolve();
                    return;
                }

                chrome.bookmarks.getChildren(rewardsFolder.id, (bookmarkItems) => {
                    if (!bookmarkItems || bookmarkItems.length === 0) {
                        console.warn("⚠️ No bookmarks found inside 'Microsoft Rewards'");
                        ProgressTracker.sendCompletionMessage('start');
                        resolve();
                        return;
                    }

                    this.openBookmarksSequentially(bookmarkItems, resolve);
                });
            });
        });
    }

    private static openBookmarksSequentially(bookmarkItems: chrome.bookmarks.BookmarkTreeNode[], resolve: () => void): void {
        let index = 0;
        const totalBookmarks = bookmarkItems.length;

        const openNext = () => {
            // Check if task was aborted
            if (!TaskManager.isTaskRunning() || TaskManager.getCurrentTask()?.type !== 'start') {
                console.log("🛑 Task was aborted, stopping bookmark opening");
                resolve();
                return;
            }

            if (index >= bookmarkItems.length) {
                console.log("✅ Finished opening all bookmarks.");
                ProgressTracker.sendCompletionMessage('start');
                currentTask = null;
                resolve();
                return;
            }

            const item = bookmarkItems[index];
            if (item.url) {
                console.log(`🧭 [${index + 1}/${bookmarkItems.length}] Opening: ${item.title} → ${item.url}`);
                chrome.tabs.create({ url: item.url, active: false });
            } else {
                console.warn(`⚠️ Skipping non-bookmark item: ${item.title}`);
            }

            // Send progress update before incrementing index
            ProgressTracker.sendProgressUpdate(index + 1, totalBookmarks);

            index++;

            // Schedule next bookmark with delay
            this.scheduleNextBookmark(openNext, index, totalBookmarks);
        };

        openNext();
    }

    private static async scheduleNextBookmark(openNext: () => void, index: number, totalBookmarks: number): Promise<void> {
        try {
            // Read settings from storage
            const skipDuration = await getStorageItem('SKIP_DURATION', 5);
            const batchSize = await getStorageItem('BATCH_SIZE', 4);
            const batchInterval = await getStorageItem('BATCH_INTERVAL', 3600);

            let delay = skipDuration * 1000;

            // If we've completed a batch and there are more items, pause for batch interval
            if (index > 0 && index % batchSize === 0 && index < totalBookmarks) {
                console.log(`⏸️ Batch completed (${index}/${totalBookmarks}). Pausing for ${batchInterval} seconds...`);
                delay = batchInterval * 1000;

                ProgressTracker.sendBatchPause(index, totalBookmarks, batchInterval);

                // Keep service worker alive during long pauses
                this.startBatchKeepAlive(delay);
            }

            const timeoutId = setTimeout(openNext, delay);
            TaskManager.setTaskTimeout(timeoutId);
        } catch (error) {
            console.error('❌ Error scheduling next bookmark:', error);
            // Continue with default delay if there's an error
            const timeoutId = setTimeout(openNext, 5000);
            TaskManager.setTaskTimeout(timeoutId);
        }
    }

    private static startBatchKeepAlive(delay: number): void {
        const batchKeepAliveInterval = setInterval(() => {
            console.log('🔄 Keeping service worker alive during batch pause...');
            // Send a heartbeat to prevent termination
            chrome.runtime.sendMessage({
                action: "heartbeat",
                timestamp: Date.now()
            }).catch((error) => {
                // Ignore all errors for heartbeat messages (popup closed is expected)
            });
        }, 30000); // Every 30 seconds

        // Clear the keep-alive interval when the pause ends
        setTimeout(() => {
            clearInterval(batchKeepAliveInterval);
            console.log('✅ Batch pause completed, resuming...');
        }, delay);
    }
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

class MessageHandlers {
    static handlePing(): MessageResponse {
        return { status: "alive", timestamp: Date.now() };
    }

    static handleAbort(): MessageResponse {
        if (TaskManager.isTaskRunning()) {
            console.log("🛑 Aborting current task");
            TaskManager.abortTask();
            ProgressTracker.sendCompletionMessage('start');
            return { success: true, message: 'Task aborted successfully' };
        } else {
            console.log("ℹ️ No task to abort");
            return { success: false, message: 'No task running' };
        }
    }

    static handleCheckTaskStatus(): MessageResponse {
        if (TaskManager.isTaskRunning()) {
            const currentTask = TaskManager.getCurrentTask();
            return {
                success: true,
                message: 'Task is running',
                status: 'running',
                taskType: currentTask?.type || 'unknown'
            };
        } else {
            return {
                success: false,
                message: 'No task running',
                status: 'idle'
            };
        }
    }

    static async handleStart(): Promise<MessageResponse> {
        // Send immediate confirmation that we're starting
        const response = { status: "starting" };

        // Start the automation asynchronously
        BookmarkAutomation.start().catch(error => {
            console.error('❌ Error starting bookmark automation:', error);
        });

        return response;
    }
}

// ============================================================================
// MAIN MESSAGE ROUTER
// ============================================================================

async function handleMessage(message: any, sender: any, sendResponse: (response: MessageResponse) => void): Promise<boolean> {
    try {
        let response: MessageResponse;

        switch (message.action) {
            case "ping":
                response = MessageHandlers.handlePing();
                break;

            case "abort":
                response = MessageHandlers.handleAbort();
                break;

            case "check-task-status":
                response = MessageHandlers.handleCheckTaskStatus();
                break;

            case "clear-bookmarks":
                // Send immediate response and process bookmarks asynchronously
                const payload = message.payload;
                const bookmarkCount = payload?.bookmarkCount || config.DEFAULT_BOOKMARK_COUNT;
                const baseUrl = payload?.baseUrl || "";

                if (!baseUrl) {
                    response = {
                        success: false,
                        message: "Base URL is required to create bookmarks"
                    };
                } else {
                    // Send immediate success response
                    response = {
                        success: true,
                        message: 'Bookmarks cleared and recreated successfully'
                    };

                    // Process bookmarks asynchronously (don't await)
                    // TODO: Seems like this is not working as expected.
                    (async () => {
                        try {
                            await MicrosoftRewardsBookmarks.emptyFolder();
                            const uniqueKeywords = getUniqueWords(bookmarkCount, keywords);
                            await MicrosoftRewardsBookmarks.createBingSearchBookmarks(
                                bookmarkCount,
                                baseUrl,
                                uniqueKeywords
                            );
                            console.log('✅ Bookmarks processed successfully in background');
                        } catch (error: any) {
                            console.error("❌ Error processing bookmarks in background:", error);
                        }
                    })();
                }
                break;
            case "start":
                // Send immediate response and start automation asynchronously
                response = { status: "starting" };

                // Start the automation asynchronously (don't await)
                (async () => {
                    try {
                        await BookmarkAutomation.start();
                        console.log('✅ Bookmark automation started successfully in background');
                    } catch (error: any) {
                        console.error('❌ Error starting bookmark automation in background:', error);
                    }
                })();
                break;

            default:
                console.warn(`⚠️ Unknown action: ${message.action}`);
                response = { success: false, message: 'Unknown action' };
        }

        sendResponse(response);
        return true;
    } catch (error) {
        console.error('❌ Error handling message:', error);
        sendResponse({ success: false, message: 'Internal error' });
        return true;
    }
}

// ============================================================================
// SERVICE WORKER LIFECYCLE
// ============================================================================

function initializeServiceWorker(): void {
    // Handle service worker installation
    self.addEventListener('install', (event: Event) => {
        console.log('Service Worker installed!');
        (self as any).skipWaiting();
    });

    // Ensure the service worker is active
    self.addEventListener('activate', (event: Event) => {
        console.log('Service Worker activated!');
        KeepAliveManager.start();
    });

    // Handle service worker termination
    self.addEventListener('beforeunload', (event: Event) => {
        console.log('Service Worker terminating...');
        KeepAliveManager.stop();
    });

    // Handle alarm events
    chrome.alarms.onAlarm.addListener(KeepAliveManager.handleAlarm);

    // Handle installation events
    chrome.runtime.onInstalled.addListener((details) => {
        console.log(`Extension installed, reason: ${details.reason}`);

        if (details.reason === "install") {
            console.log("First time installation successful");
        }

        if (details.reason === "update") {
            console.log(`Extension updated from version: ${details.previousVersion}`);
        }
    });

    // Handle messages
    chrome.runtime.onMessage.addListener(handleMessage);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

initializeServiceWorker();
