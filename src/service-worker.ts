/// <reference types="chrome" />

import { getStorageItem } from "./utils/storage";

console.log('Service Worker loaded!');

// Task tracking
let currentTask: {
    type: string;
    tabId?: number;
    intervalId?: ReturnType<typeof setInterval>;
    timeoutId?: ReturnType<typeof setTimeout>;
} | null = null;

// Ensure the service worker is active
self.addEventListener('activate', (event: Event) => {
    console.log('Service Worker activated!');
});

chrome.runtime.onInstalled.addListener((details) => {
    console.log('=== ONINSTALLED EVENT FIRED ===');
    console.log(`Extension installed, reason: ${details.reason}`);

    if (details.reason === "install") {
        console.log("First time installation successful");
    } else if (details.reason === "update") {
        console.log(`Extension updated from version: ${details.previousVersion}`);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "abortAutomation") {
        if (currentTask) {
            const taskType = currentTask.type; // Store the type before aborting
            console.log("🛑 Aborting current task:", taskType);
            abortCurrentTask();

            // Send completion message for bookmark automation if it was running
            if (taskType === 'startBookmarkAutomation') {
                chrome.runtime.sendMessage({
                    status: "done",
                    action: "startBookmarkAutomation"
                }).catch(error => {
                    console.error('Failed to send completion message:', error);
                });
            }

            sendResponse({ success: true, message: 'Task aborted successfully' });
        } else {
            console.log("ℹ️ No task to abort");
            sendResponse({ success: false, message: 'No task running' });
        }
        return true;
    }

    if (message.action === "startBookmarkAutomation") {
        console.log("🔄 Starting bookmark automation");

        // Check if there's already a task running
        if (currentTask) {
            console.log("⚠️ Task already in progress, aborting current task");
            abortCurrentTask();
        }

        // Set current task
        currentTask = { type: 'startBookmarkAutomation' };

        // Send immediate response
        sendResponse({ status: "automation-in-progress" });

        // Start the bookmark opening process with progress tracking
        getMicrosoftRewardsBookmarksWithProgress();

        return true;
    }

    return true; // Keep the message channel open
});

function abortCurrentTask() {
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

function getMicrosoftRewardsBookmarksWithProgress() {
    chrome.bookmarks.getChildren("1", (barItems) => {
        const rewardsFolder = barItems.find(
            (item) => item.title === "Microsoft Rewards" && !item.url
        );

        if (!rewardsFolder) {
            console.warn("❌ 'Microsoft Rewards' folder not found in Bookmarks Bar");
            // Send completion message
            chrome.runtime.sendMessage({
                status: "done",
                action: "startBookmarkAutomation"
            }).catch(error => {
                console.error('Failed to send completion message:', error);
            });
            return;
        }

        chrome.bookmarks.getChildren(rewardsFolder.id, (bookmarkItems) => {
            if (!bookmarkItems || bookmarkItems.length === 0) {
                console.warn("⚠️ No bookmarks found inside 'Microsoft Rewards'");
                // Send completion message
                chrome.runtime.sendMessage({
                    status: "done",
                    action: "startBookmarkAutomation"
                }).catch(error => {
                    console.error('Failed to send completion message:', error);
                });
                return;
            }

            let index = 0;
            const totalBookmarks = bookmarkItems.length;

            function openNext() {
                // Check if task was aborted
                if (!currentTask || currentTask.type !== 'startBookmarkAutomation') {
                    console.log("🛑 Task was aborted, stopping bookmark opening");
                    return;
                }

                if (index >= bookmarkItems.length) {
                    console.log("✅ Finished opening all bookmarks.");
                    // Send completion message
                    chrome.runtime.sendMessage({
                        status: "done",
                        action: "startBookmarkAutomation"
                    }).catch(error => {
                        console.error('Failed to send completion message:', error);
                    });
                    currentTask = null;
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
                chrome.runtime.sendMessage({
                    action: "automation-progress-update",
                    currentIndex: index + 1,
                    totalBookmarks: totalBookmarks
                }).catch(error => {
                    console.error('Failed to send progress update:', error);
                });

                index++;

                // Get skip duration from storage, default to 5 seconds
                getStorageItem('SKIP_DURATION', 5).then((skipDuration) => {
                    const timeoutId = setTimeout(openNext, skipDuration * 1000);
                    if (currentTask) {
                        currentTask.timeoutId = timeoutId;
                    }
                });
            }

            openNext();
        });
    });
}
