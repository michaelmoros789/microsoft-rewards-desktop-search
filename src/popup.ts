/// <reference types="chrome" />

import { config } from "./config";
import { Logger } from "./utils/logger";
import { getStorageItem, setStorageItem } from "./utils/storage";
import { isValidUrlPattern, validateSkipDuration, validateBookmarkCount } from "./utils/validator";
import { NotificationManager } from "./utils/notification";

import { MicrosoftRewardsBookmarks } from "./utils/bookmark";

/**
 * Application state for the popup UI.
 */
type AppState = {
    /** Interval ID for the bookmark opening process */
    intervalId: ReturnType<typeof setInterval> | null;
    /** Whether the bookmark opening process is running */
    isProcessRunning: boolean;
    /** Last visited bookmark index */
    lastVisitedIndex: number;

    settings: {
        /** Delay (seconds) between opening bookmarks */
        skipDuration: number;
        /** Number of bookmarks to create/use */
        bookmarkCount: number;
        /** Bing search base URL */
        baseUrl: string;
        /** Whether the base URL is valid for Bing search */
        isBaseUrlValid: boolean;
    };
};

/**
 * Global state object for the popup UI.
 */
const state: AppState = {
    intervalId: null,
    lastVisitedIndex: 0,
    isProcessRunning: false,
    settings: {
        skipDuration: config.DEFAULT_SKIP_DURATION,
        bookmarkCount: config.DEFAULT_BOOKMARK_COUNT,
        baseUrl: "",
        isBaseUrlValid: false,
    }
};

// DOM Elements
const counterDisplay = document.getElementById("counterDisplay") as HTMLElement;
const timeRemaining = document.getElementById("timeRemaining") as HTMLElement;
const baseUrlTextbox = document.getElementById("baseUrl") as HTMLInputElement;
const openBookmarkButton = document.getElementById("openBookmark") as HTMLButtonElement;
const resetProgressButton = document.getElementById("resetProgress") as HTMLButtonElement;
const validationStatus = document.getElementById("validationStatus") as HTMLElement;
const skipDurationInput = document.getElementById("skipDuration") as HTMLInputElement;
const bookmarkCountInput = document.getElementById("bookmarkCount") as HTMLInputElement;
const progressBar = document.querySelector(".progress-bar") as HTMLElement;
const abortTaskButton = document.getElementById("abortTask") as HTMLButtonElement;

// Access keywords from window object (populated by keywords.js)
const keywords = (window as any).keywords as string[];

// Initialize notification manager
const notificationManager = NotificationManager.getInstance();

/**
 * Show a user-friendly notification message using the notification manager.
 * @param message The message to display
 * @param type The type of notification (success, error, warning, info)
 */
function showNotification(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): void {
    notificationManager.show(message, type);
}

/**
 * Update the progress bar animation duration based on skip duration.
 * @param skipDuration The skip duration in seconds
 */
function updateProgressBarDuration(skipDuration: number): void {
    if (progressBar) {
        progressBar.style.animationDuration = `${skipDuration}s`;
    }
}

/**
 * Stop the progress bar animation.
 */
function stopProgressBarAnimation(): void {
    if (progressBar) {
        progressBar.classList.remove('animating');
        progressBar.style.width = '0%';
    }
}

/**
 * Format seconds into MM:SS format.
 * @param totalSeconds Total seconds to format
 * @returns Formatted time string
 */
function formatTime(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Update the timer display with remaining time.
 * @param currentIndex Current bookmark index (1-based, represents items processed)
 * @param totalBookmarks Total number of bookmarks
 * @param skipDuration Skip duration in seconds
 */
function updateTimer(currentIndex: number, totalBookmarks: number, skipDuration: number): void {
    if (timeRemaining) {
        // currentIndex represents how many items have been processed (1-based)
        // For example: if currentIndex is 3, we've processed 3 items
        const remainingBookmarks = totalBookmarks - currentIndex;
        const remainingSeconds = remainingBookmarks * skipDuration;

        if (remainingSeconds > 0) {
            timeRemaining.textContent = `< ${formatTime(remainingSeconds)}`;
        } else {
            timeRemaining.textContent = "00:00";
        }
    }
}

/**
 * Update the UI to reflect the current base URL validation status.
 * @param url The base URL to validate
 */
function updateValidationStatus(url: string): void {
    state.settings.isBaseUrlValid = isValidUrlPattern(url);

    if (state.settings.isBaseUrlValid) {
        validationStatus.textContent = "Valid";
        validationStatus.className = "validation-status valid";
        if (openBookmarkButton) {
            openBookmarkButton.disabled = false;
        }
    } else {
        validationStatus.textContent = "Invalid";
        validationStatus.className = "validation-status invalid";
        if (openBookmarkButton) {
            openBookmarkButton.disabled = true;
        }
    }
}

/**
 * Handle input event for bookmark count field.
 * @param e Input event
 */
function handleBookmarkCountInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    const value = validateBookmarkCount(target.value);
    target.value = value.toString();
    state.settings.bookmarkCount = value;
    setStorageItem('BOOKMARK_COUNT', value);
}

/**
 * Handle blur event for bookmark count field.
 * @param e Blur event
 */
function handleBookmarkCountBlur(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (!target.value) {
        target.value = config.DEFAULT_BOOKMARK_COUNT.toString();
        state.settings.bookmarkCount = config.DEFAULT_BOOKMARK_COUNT;
        setStorageItem('BOOKMARK_COUNT', config.DEFAULT_BOOKMARK_COUNT);
    }
}

/**
 * Handle input event for skip duration field.
 * @param e Input event
 */
function handleSkipDurationInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    const value = validateSkipDuration(target.value);
    target.value = value.toString();
    state.settings.skipDuration = value;

    // Only update progress bar animation if not in progress
    if (!state.isProcessRunning) {
        updateProgressBarDuration(value);
    }

    setStorageItem('SKIP_DURATION', value);
}

/**
 * Handle blur event for skip duration field.
 * @param e Blur event
 */
function handleSkipDurationBlur(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (!target.value) {
        target.value = config.DEFAULT_SKIP_DURATION.toString();
        state.settings.skipDuration = config.DEFAULT_SKIP_DURATION;

        // Only update progress bar animation if not in progress
        if (!state.isProcessRunning) {
            updateProgressBarDuration(config.DEFAULT_SKIP_DURATION);
        }

        setStorageItem('SKIP_DURATION', config.DEFAULT_SKIP_DURATION);
    }
}

/**
 * Handle input/blur event for base URL field.
 * @param e Input or blur event
 */
function handleBaseUrlInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    state.settings.baseUrl = target.value;
    updateValidationStatus(state.settings.baseUrl);
    setStorageItem('BASE_URL', state.settings.baseUrl);
}

/**
 * Handle click event for reset progress button.
 * Stops any running process, clears bookmarks, and resets state.
 */
async function handleResetProgressClick(): Promise<void> {
    try {
        if (state.intervalId) {
            clearInterval(state.intervalId);
            state.intervalId = null;
        }
        state.isProcessRunning = false;
        stopProgressBarAnimation();

        // Reset timer
        if (timeRemaining) {
            timeRemaining.textContent = "--:--";
        }

        await MicrosoftRewardsBookmarks.emptyFolder();
        await MicrosoftRewardsBookmarks.createBingSearchBookmarks(
            state.settings.bookmarkCount,
            state.settings.baseUrl,
            keywords
        );

        setStorageItem('lastVisitedIndex', 0);
        initialize();
        showNotification('Progress reset successfully!', 'success');
    } catch (error) {
        Logger.error('Error in reset progress:', error);
        showNotification('Error resetting progress', 'error');
    }
}

// Event listener assignments for UI controls
baseUrlTextbox.addEventListener("blur", handleBaseUrlInput);
baseUrlTextbox.addEventListener("input", handleBaseUrlInput);
skipDurationInput.addEventListener("blur", handleSkipDurationBlur);
skipDurationInput.addEventListener("input", handleSkipDurationInput);
bookmarkCountInput.addEventListener("input", handleBookmarkCountInput);
bookmarkCountInput.addEventListener("blur", handleBookmarkCountBlur);
resetProgressButton.addEventListener("click", handleResetProgressClick);
openBookmarkButton.addEventListener("click", handleOpenBookmarkClick);

// Set up abort button event listener
if (abortTaskButton) {
    abortTaskButton.addEventListener("click", handleAbortTaskClick);
}

document.addEventListener("DOMContentLoaded", () => {
    Logger.info('Popup initialized');

    // Initialize abort button as disabled
    if (abortTaskButton) {
        abortTaskButton.disabled = true;
    }

    initialize();
});

/**
 * Initialize the popup UI by loading state from storage and updating the UI.
 */
async function initialize(): Promise<void> {
    try {
        state.settings.baseUrl = await getStorageItem("BASE_URL", "");
        baseUrlTextbox.value = state.settings.baseUrl;
        updateValidationStatus(state.settings.baseUrl);

        state.settings.skipDuration = await getStorageItem("SKIP_DURATION", config.DEFAULT_SKIP_DURATION);
        skipDurationInput.value = state.settings.skipDuration.toString();
        updateProgressBarDuration(state.settings.skipDuration);

        state.settings.bookmarkCount = await getStorageItem("BOOKMARK_COUNT", config.DEFAULT_BOOKMARK_COUNT);
        bookmarkCountInput.value = state.settings.bookmarkCount.toString();

        state.lastVisitedIndex = await getStorageItem("lastVisitedIndex", 0);

        // Ensure Microsoft Rewards folder exists
        try {
            await MicrosoftRewardsBookmarks.ensureFolder();

            // Update progress display
            const bookmarkCount = await MicrosoftRewardsBookmarks.getBookmarkCount();
            counterDisplay.textContent = `${state.lastVisitedIndex} out of ${bookmarkCount}`;
        } catch (error) {
            Logger.error('Error ensuring Microsoft Rewards folder:', error);
            counterDisplay.textContent = "0 out of 0";
        }
    } catch (error) {
        Logger.error('Error in initialize:', error);
        showNotification('Failed to initialize extension', 'error');
    }
}

/**
 * Handle click event for the Start/Resume Script button.
 * Starts the bookmark opening process if the base URL is valid and not already running.
 */
async function handleOpenBookmarkClick(): Promise<void> {
    if (!state.settings.isBaseUrlValid) {
        showNotification('Base URL is not valid', 'error');
        return;
    }

    if (state.isProcessRunning) {
        showNotification('Process is already running. Please wait for it to complete.', 'warning');
        return;
    }

    try {
        const bookmarks = await MicrosoftRewardsBookmarks.getBookmarks();

        if (!bookmarks.length) {
            showNotification('No bookmarks found. Please reset progress first.', 'warning');
            return;
        }

        state.isProcessRunning = true;

        // Start the first progress bar animation immediately
        if (progressBar) {
            progressBar.classList.remove('animating');
            progressBar.style.width = '0%';
            progressBar.offsetHeight; // Force reflow
            progressBar.classList.add('animating');
        }

        // Initialize timer - start with 0 since we're about to process the first bookmark
        updateTimer(0, bookmarks.length, state.settings.skipDuration);

        showNotification('Bookmark automation started!', 'success');
        Logger.info('Bookmark automation started');

        chrome.runtime.sendMessage({ action: 'startBookmarkAutomation' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Service worker error:', chrome.runtime.lastError);
                showNotification('Service worker not responding', 'error');
            } else if (response && response.status === 'automation-in-progress') {
                state.isProcessRunning = true;
                openBookmarkButton.textContent = 'Working...';
                openBookmarkButton.disabled = true;

                // Enable abort button when task starts
                if (abortTaskButton) {
                    abortTaskButton.disabled = false;
                }

                // Disable reset progress button when task starts
                if (resetProgressButton) {
                    resetProgressButton.disabled = true;
                }

                showNotification('Task started!', 'info');
            }
        });
    } catch (error) {
        Logger.error('Failed to access bookmarks:', error);
        showNotification('Failed to access bookmarks', 'error');
    }
}

// Listen for completion message from service worker
chrome.runtime.onMessage.addListener((message) => {
    if (message.status === 'done' && message.action === 'startBookmarkAutomation') {
        state.isProcessRunning = false;
        if (openBookmarkButton) {
            openBookmarkButton.textContent = 'Start Task';
            openBookmarkButton.disabled = false;
        }

        // Enable reset progress button when task completes
        if (resetProgressButton) {
            resetProgressButton.disabled = false;
        }

        // Disable abort button when task completes
        if (abortTaskButton) {
            abortTaskButton.disabled = true;
        }

        showNotification('Task completed!', 'success');
    }

    // Handle bookmark automation progress updates
    if (message.action === 'automation-progress-update') {
        const { currentIndex, totalBookmarks } = message;
        if (counterDisplay) {
            counterDisplay.textContent = `${currentIndex} out of ${totalBookmarks}`;
        }

        // Update progress bar animation
        if (progressBar) {
            progressBar.classList.remove('animating');
            progressBar.style.width = '0%';
            // Force a reflow to ensure the reset is applied
            progressBar.offsetHeight;
            progressBar.classList.add('animating');
        }

        // Update timer
        updateTimer(currentIndex, totalBookmarks, state.settings.skipDuration);

        console.log(`Progress Update: ${currentIndex}/${totalBookmarks}`);
    }

    // Handle abort completion (when service worker sends completion after abort)
    if (message.status === 'done' && message.action === 'startBookmarkAutomation' && !state.isProcessRunning) {
        // This handles the case where the service worker sends completion after abort
        // We don't need to do anything since handleAbortTaskClick already reset the UI
        Logger.info('Received completion message after abort');
    }
});

/**
 * Handle click event for the abort task button.
 * Stops the current bookmark opening process.
 */
function handleAbortTaskClick(): void {
    if (!state.isProcessRunning) {
        showNotification('No task is currently running', 'warning');
        return;
    }

    chrome.runtime.sendMessage({ action: 'abortAutomation' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Service worker error:', chrome.runtime.lastError);
            showNotification('Service worker not responding', 'error');
            return;
        }

        // Reset UI state
        state.isProcessRunning = false;

        // Reset start button
        if (openBookmarkButton) {
            openBookmarkButton.textContent = 'Start Task';
            openBookmarkButton.disabled = false;
        }

        // Enable reset progress button
        if (resetProgressButton) {
            resetProgressButton.disabled = false;
        }

        // Disable abort button
        if (abortTaskButton) {
            abortTaskButton.disabled = true;
        }

        // Stop progress bar animation
        stopProgressBarAnimation();

        // Reset timer
        if (timeRemaining) {
            timeRemaining.textContent = "--:--";
        }

        showNotification('Task aborted successfully!', 'info');
        Logger.info('Task aborted by user');
    });
}


