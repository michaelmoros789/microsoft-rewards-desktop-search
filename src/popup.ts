/// <reference types="chrome" />

import { config } from "./config";
import { Logger } from "./utils/logger";
import { getStorageItem, setStorageItem } from "./utils/storage";
import { isValidUrlPattern, validateSkipDuration, validateBookmarkCount, validateBatchSize, validateBatchInterval } from "./utils/validator";
import { NotificationManager } from "./utils/notification";
import { ClearBookmarksMessage } from "./utils/types";
import { computeTiming } from "./utils/timing";

// DOM Elements
const counterDisplay = document.getElementById("counterDisplay") as HTMLElement;
const timeRemaining = document.getElementById("timeRemaining") as HTMLElement;
const syncDisplay = document.getElementById("syncDisplay") as HTMLElement;
const statusDisplay = document.getElementById("statusDisplay") as HTMLElement;
const baseUrlTextbox = document.getElementById("baseUrl") as HTMLInputElement;
const lockBaseUrlCheckbox = document.getElementById("lockBaseUrl") as HTMLInputElement;
const openBookmarkButton = document.getElementById("openBookmark") as HTMLButtonElement;
const applyChangesButton = document.getElementById("apply-changes") as HTMLButtonElement;
const loadDefaultsButton = document.getElementById("load-defaults") as HTMLButtonElement;
const validationStatus = document.getElementById("validationStatus") as HTMLElement;
const skipDurationInput = document.getElementById("skipDuration") as HTMLInputElement;
const bookmarkCountInput = document.getElementById("bookmarkCount") as HTMLInputElement;
const batchSizeInput = document.getElementById("batchSize") as HTMLInputElement;
const batchIntervalInput = document.getElementById("batchInterval") as HTMLInputElement;
const abortTaskButton = document.getElementById("abortTask") as HTMLButtonElement;

/**
 * Application state for the popup UI.
 */
type AppState = {
    /** Whether the bookmark opening process is running */
    isProcessRunning: boolean;
    /** Current status of the automation */
    currentStatus: 'Idle' | 'Executing' | 'On-Pause';
    /** Current progress display value */
    currentProgress: string;
    /** Current timer display value */
    currentTimer: string;
    /** Whether input fields are locked */
    inputFieldsLocked: boolean;
    /** Whether the state is synchronized with service worker */
    isSync: boolean;
    /** Button states */
    buttonStates: {
        startButtonText: string;
        startButtonDisabled: boolean;
        abortButtonDisabled: boolean;
        resetButtonDisabled: boolean;
    };
    settings: {
        /** Delay (seconds) between opening bookmarks */
        skipDuration: number;
        /** Number of bookmarks to create/use */
        bookmarkCount: number;
        /** Number of items to process per batch */
        batchSize: number;
        /** Pause duration between batches (seconds) */
        batchInterval: number;
        /** Bing search base URL */
        baseUrl: string;
        /** Whether the base URL is valid for Bing search */
        isBaseUrlValid: boolean;
        /** Whether the base URL is locked from being overwritten */
        isBaseUrlLocked: boolean;
    };
};

/**
 * Global state object for the popup UI.
 */
const state: AppState = {
    isProcessRunning: false,
    currentStatus: 'Idle',
    currentProgress: "0/0",
    currentTimer: "--:--",
    inputFieldsLocked: false,
    isSync: false,
    buttonStates: {
        startButtonText: "Start Task",
        startButtonDisabled: false,
        abortButtonDisabled: true,
        resetButtonDisabled: false,
    },
    settings: {
        skipDuration: config.DEFAULT_SKIP_DURATION,
        bookmarkCount: config.DEFAULT_BOOKMARK_COUNT,
        batchSize: config.DEFAULT_BATCH_SIZE,
        batchInterval: config.DEFAULT_BATCH_INTERVAL,
        baseUrl: "",
        isBaseUrlValid: false,
        isBaseUrlLocked: false,
    }
};

// Track original values as stringified JSON to detect changes
let originalSettingsString = "";

// Track if form has unsaved changes
let hasUnsavedChanges = false;

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
function updateStatus(status: 'Idle' | 'Executing' | 'On-Pause'): void {
    // Update state
    state.currentStatus = status;

    if (statusDisplay) {
        statusDisplay.textContent = status;
        statusDisplay.className = '';

        if (status === 'Executing') {
            statusDisplay.classList.add('executing');
        }

        if (status === 'On-Pause') {
            statusDisplay.classList.add('paused');
        }
    }

    updateFormState();
}

/**
 * Update the sync status display.
 * @param isSync Whether the state is synchronized
 */
function updateSyncStatus(isSync: boolean): void {
    state.isSync = isSync;

    if (syncDisplay) {
        syncDisplay.textContent = isSync ? 'Sync' : 'Not Synced';
        syncDisplay.className = isSync ? 'sync' : 'not-sync';
    }

    // Save state to storage
    saveUIState();
}

/**
 * Check if form values differ from stored settings and update UI accordingly.
 */
function checkForUnsavedChanges(): void {
    const currentFormValues = {
        skipDuration: parseInt(skipDurationInput.value) || config.DEFAULT_SKIP_DURATION,
        bookmarkCount: parseInt(bookmarkCountInput.value) || config.DEFAULT_BOOKMARK_COUNT,
        batchSize: parseInt(batchSizeInput.value) || config.DEFAULT_BATCH_SIZE,
        batchInterval: parseInt(batchIntervalInput.value) || config.DEFAULT_BATCH_INTERVAL,
        baseUrl: baseUrlTextbox.value
    };

    // Compare by stringifying current values with original
    const currentSettingsString = JSON.stringify(currentFormValues);
    hasUnsavedChanges = originalSettingsString !== currentSettingsString;

    // Update button states
    if (openBookmarkButton) {
        openBookmarkButton.disabled = hasUnsavedChanges || state.currentStatus !== 'Idle';
    }

    if (applyChangesButton) {
        applyChangesButton.disabled = !hasUnsavedChanges || state.currentStatus !== 'Idle';
    }

    // Update sync status
    updateSyncStatus(!hasUnsavedChanges);
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
 * Update the timer display with formatted time.
 * @param remainingTime Remaining time in seconds
 */
function updateTimer(remainingTime: number): void {
    if (timeRemaining) {
        timeRemaining.textContent = `< ${formatTime(remainingTime)}`;
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

    if (counterDisplay && !state.isProcessRunning) {
        counterDisplay.textContent = `0/${value}`;
    }

    checkForUnsavedChanges();
}

/**
 * Handle blur event for bookmark count field.
 * @param e Blur event
 */
function handleBookmarkCountBlur(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (!target.value) {
        target.value = config.DEFAULT_BOOKMARK_COUNT.toString();
    }

    checkForUnsavedChanges();
}

/**
 * Handle input event for batch size field.
 * @param e Input event
 */
function handleBatchSizeInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    const value = validateBatchSize(target.value);
    target.value = value.toString();
    checkForUnsavedChanges();
}

/**
 * Handle blur event for batch size field.
 * @param e Blur event
 */
function handleBatchSizeBlur(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (!target.value) {
        target.value = config.DEFAULT_BATCH_SIZE.toString();
    }

    checkForUnsavedChanges();
}

/**
 * Handle input event for batch interval field.
 * @param e Input event
 */
function handleBatchIntervalInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    const value = validateBatchInterval(target.value);
    target.value = value.toString();
    checkForUnsavedChanges();
}

/**
 * Handle blur event for batch interval field.
 * @param e Blur event
 */
function handleBatchIntervalBlur(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (!target.value) {
        target.value = config.DEFAULT_BATCH_INTERVAL.toString();
    }
    checkForUnsavedChanges();
}

/**
 * Handle input event for skip duration field.
 * @param e Input event
 */
function handleSkipDurationInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    const value = validateSkipDuration(target.value);
    target.value = value.toString();
    checkForUnsavedChanges();
}

/**
 * Handle blur event for skip duration field.
 * @param e Blur event
 */
function handleSkipDurationBlur(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (!target.value) {
        target.value = config.DEFAULT_SKIP_DURATION.toString();
    }
    checkForUnsavedChanges();
}

/**
 * Handle input/blur event for base URL field.
 * @param e Input or blur event
 */
function handleBaseUrlInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    updateValidationStatus(target.value);
    checkForUnsavedChanges();
}

function handleLockBaseUrlChange(e: Event): void {
    // Prevent changing lock state when task is running
    const isTaskRunning = state.currentStatus === 'Executing' || state.currentStatus === 'On-Pause';
    if (isTaskRunning) {
        e.preventDefault();
        showNotification('Cannot change lock while task is running', 'warning');
        return;
    }

    const target = e.target as HTMLInputElement;
    state.settings.isBaseUrlLocked = target.checked;

    // Save lock state to storage
    setStorageItem('BASE_URL_LOCKED', target.checked);
    saveUIState();

    // Update text field disabled state
    if (baseUrlTextbox) {
        baseUrlTextbox.disabled = target.checked;
    }

    if (target.checked) {
        showNotification('Base URL locked', 'info');
    } else {
        showNotification('Base URL unlocked', 'info');
    }
}

/**
 * Handle click event for the abort task button.
 * Stops the current bookmark opening process.
 */
function handleAbortTaskClick(): void {
    if (!state.isProcessRunning) {
        showNotification('No task is currently running', 'warning');
        return;
    }

    chrome.runtime.sendMessage({ action: 'abort' }, async (response) => {
        if (chrome.runtime.lastError) {
            console.error('Service worker error:', chrome.runtime.lastError);
            showNotification('Service worker not responding', 'error');
            return;
        }

        // Reset UI state
        state.isProcessRunning = false;

        // Reset start button text
        if (openBookmarkButton) {
            openBookmarkButton.textContent = 'Start Task';
        }

        // Update status (this will automatically update all form fields and buttons)
        updateStatus('Idle');

        // Reset timer
        if (timeRemaining) {
            timeRemaining.textContent = "--:--";
        }

        // Reset progress counter to 0
        if (counterDisplay) {
            counterDisplay.textContent = `0/${state.settings.bookmarkCount}`;
        }

        showNotification('Task aborted successfully!', 'info');
        Logger.info('Task aborted by user');

        // Save state after abort
        await saveUIState();
    });
}

/**
 * Handle click event for apply changes button.
 * Applies current input values to storage and updates bookmarks without resetting progress.
 */
async function handleLoadDefaults(): Promise<void> {
    try {
        if (state.isProcessRunning) {
            showNotification('Cannot load defaults while task is running', 'warning');
            return;
        }

        // Update state with new values
        state.settings.bookmarkCount = config.DEFAULT_BOOKMARK_COUNT;
        state.settings.skipDuration = config.DEFAULT_SKIP_DURATION;
        state.settings.batchSize = config.DEFAULT_BATCH_SIZE;
        state.settings.batchInterval = config.DEFAULT_BATCH_INTERVAL;

        statusDisplay.textContent = 'Idle';
        statusDisplay.classList.remove('executing');
        timeRemaining.textContent = '--:--';
        counterDisplay.textContent = `0/${config.DEFAULT_BOOKMARK_COUNT}`;

        // Only update base URL if it's not locked
        if (!state.settings.isBaseUrlLocked) {
            state.settings.baseUrl = config.DEFAULT_BASE_URL;
            state.settings.isBaseUrlValid = isValidUrlPattern(config.DEFAULT_BASE_URL);
        }

        // Update form field values
        bookmarkCountInput.value = config.DEFAULT_BOOKMARK_COUNT.toString();
        skipDurationInput.value = config.DEFAULT_SKIP_DURATION.toString();
        batchSizeInput.value = config.DEFAULT_BATCH_SIZE.toString();
        batchIntervalInput.value = config.DEFAULT_BATCH_INTERVAL.toString();

        // Only update base URL field if it's not locked
        if (!state.settings.isBaseUrlLocked) {
            baseUrlTextbox.value = config.DEFAULT_BASE_URL;
            updateValidationStatus(config.DEFAULT_BASE_URL);
        }

        // Save to storage
        setStorageItem('BOOKMARK_COUNT', config.DEFAULT_BOOKMARK_COUNT);
        setStorageItem('SKIP_DURATION', config.DEFAULT_SKIP_DURATION);
        setStorageItem('BATCH_SIZE', config.DEFAULT_BATCH_SIZE);
        setStorageItem('BATCH_INTERVAL', config.DEFAULT_BATCH_INTERVAL);

        // Only save base URL if it's not locked
        if (!state.settings.isBaseUrlLocked) {
            setStorageItem('BASE_URL', config.DEFAULT_BASE_URL);
        }

        const message: ClearBookmarksMessage = {
            action: 'clear-bookmarks',
            payload: {
                bookmarkCount: config.DEFAULT_BOOKMARK_COUNT,
                baseUrl: state.settings.baseUrl
            }
        };

        // Add a timeout to prevent message port closure
        const messageTimeout = setTimeout(() => {
            console.log('Message timeout - service worker may still be processing');
        }, 10000); // 10 second timeout

        chrome.runtime.sendMessage(message, (response) => {
            clearTimeout(messageTimeout);

            if (response && response.success) {
                const message = response.message || 'Bookmarks cleared successfully!';
                showNotification(message, 'success');
                // Set sync status to true when defaults are loaded successfully
                updateSyncStatus(true);
            } else if (response && response.success === false && response.message === 'Base URL is required to create bookmarks') {
                showNotification("Default values set, but unable to create bookmarks. Base URL is required to create bookmarks", 'warning');
                Logger.error('Bookmarks operation failed:', response.message);
                // Set sync status to true even if bookmarks couldn't be created (settings are synced)
                updateSyncStatus(true);
            } else if (chrome.runtime.lastError) {
                showNotification('Failed to communicate with service worker', 'error');
            } else {
                showNotification('Failed to clear bookmarks', 'error');
            }
        });
    } catch (error) {
        Logger.error('Error loading defaults:', error);
        showNotification('Error loading defaults', 'error');
    }
}

/**
 * Handle click event for the Apply Changes button.
 * Saves current form values to storage and syncs with service worker.
 */
async function handleApplyChangesClick(): Promise<void> {
    try {
        // Get current form values
        const currentSettings = {
            skipDuration: parseInt(skipDurationInput.value) || config.DEFAULT_SKIP_DURATION,
            bookmarkCount: parseInt(bookmarkCountInput.value) || config.DEFAULT_BOOKMARK_COUNT,
            batchSize: parseInt(batchSizeInput.value) || config.DEFAULT_BATCH_SIZE,
            batchInterval: parseInt(batchIntervalInput.value) || config.DEFAULT_BATCH_INTERVAL,
            baseUrl: baseUrlTextbox.value
        };

        // Validate base URL
        if (!isValidUrlPattern(currentSettings.baseUrl)) {
            showNotification('Base URL is not valid', 'error');
            return;
        }

        // Save to storage
        await setStorageItem('SKIP_DURATION', currentSettings.skipDuration);
        await setStorageItem('BOOKMARK_COUNT', currentSettings.bookmarkCount);
        await setStorageItem('BATCH_SIZE', currentSettings.batchSize);
        await setStorageItem('BATCH_INTERVAL', currentSettings.batchInterval);
        await setStorageItem('BASE_URL', currentSettings.baseUrl);

        // Update state
        state.settings = {
            ...state.settings,
            ...currentSettings,
            isBaseUrlValid: isValidUrlPattern(currentSettings.baseUrl)
        };

        // Update original settings string
        originalSettingsString = JSON.stringify(currentSettings);

        // Send clear-bookmarks request with updated values to sync with service worker
        const message = {
            action: 'clear-bookmarks',
            payload: {
                bookmarkCount: currentSettings.bookmarkCount,
                baseUrl: currentSettings.baseUrl
            }
        };

        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                showNotification('Failed to communicate with service worker', 'error');
                Logger.error('Chrome runtime error:', chrome.runtime.lastError);
            } else if (response && response.success) {
                showNotification('Changes applied successfully!', 'success');
                hasUnsavedChanges = false;
                checkForUnsavedChanges();
            } else {
                showNotification('Failed to apply changes', 'error');
            }
        });

    } catch (error) {
        Logger.error('Error applying changes:', error);
        showNotification('Error applying changes', 'error');
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

    if (!state.isSync) {
        showNotification('State is not synchronized. Please load defaults first.', 'warning');
        return;
    }

    if (state.isProcessRunning) {
        showNotification('Process is already running. Please wait for it to complete.', 'warning');
        return;
    }

    try {
        const { bookmarkCount, skipDuration, batchSize, batchInterval } = state.settings;
        const { remainingTime } = computeTiming({
            totalBookmarks: bookmarkCount,
            currentIndex: 0,
            skipDuration,
            batchSize,
            batchInterval
        });

        updateTimer(remainingTime);

        chrome.runtime.sendMessage({ action: 'start' }, async (response) => {
            if (response && response.status === 'starting') {
                // Service worker confirmed it's starting the task
                state.isProcessRunning = true;

                // Update button text
                if (openBookmarkButton) {
                    openBookmarkButton.textContent = 'Working...';
                }

                // Update status (this will automatically update all form fields and buttons)
                updateStatus('Executing');
                showNotification('Task started!', 'success');
                await saveUIState();
            }
        });
    } catch (error) {
        Logger.error('Failed to access bookmarks:', error);
        showNotification('Failed to access bookmarks', 'error');
    }
}

// Event listener assignments for UI controls
baseUrlTextbox.addEventListener("blur", handleBaseUrlInput);
baseUrlTextbox.addEventListener("input", handleBaseUrlInput);
skipDurationInput.addEventListener("blur", handleSkipDurationBlur);
skipDurationInput.addEventListener("input", handleSkipDurationInput);
bookmarkCountInput.addEventListener("input", handleBookmarkCountInput);
bookmarkCountInput.addEventListener("blur", handleBookmarkCountBlur);
batchSizeInput.addEventListener("input", handleBatchSizeInput);
batchSizeInput.addEventListener("blur", handleBatchSizeBlur);
batchIntervalInput.addEventListener("input", handleBatchIntervalInput);
batchIntervalInput.addEventListener("blur", handleBatchIntervalBlur);
loadDefaultsButton.addEventListener("click", handleLoadDefaults);
openBookmarkButton.addEventListener("click", handleOpenBookmarkClick);
applyChangesButton.addEventListener("click", handleApplyChangesClick);
abortTaskButton.addEventListener("click", handleAbortTaskClick);
lockBaseUrlCheckbox.addEventListener("change", handleLockBaseUrlChange);

document.addEventListener("DOMContentLoaded", () => {
    Logger.info('Popup initialized');
    initialize('initial');
});

// Save state when popup is about to close
window.addEventListener('beforeunload', async () => {
    await saveUIState();
    Logger.info('Popup closing, state saved');
});


/**
 * Initialize the popup UI by loading state from storage and updating the UI.
 * @param caller Optional parameter to identify the caller for notification messages
 */
async function initialize(caller?: 'reset' | 'initial'): Promise<void> {
    try {
        state.settings.baseUrl = await getStorageItem("BASE_URL", "");
        state.settings.isBaseUrlLocked = await getStorageItem("BASE_URL_LOCKED", false);
        baseUrlTextbox.value = state.settings.baseUrl;
        lockBaseUrlCheckbox.checked = state.settings.isBaseUrlLocked;
        baseUrlTextbox.disabled = state.settings.isBaseUrlLocked;
        updateValidationStatus(state.settings.baseUrl);

        state.settings.skipDuration = await getStorageItem("SKIP_DURATION", config.DEFAULT_SKIP_DURATION);
        skipDurationInput.value = state.settings.skipDuration.toString();

        state.settings.bookmarkCount = await getStorageItem("BOOKMARK_COUNT", config.DEFAULT_BOOKMARK_COUNT);
        bookmarkCountInput.value = state.settings.bookmarkCount.toString();

        state.settings.batchSize = await getStorageItem("BATCH_SIZE", config.DEFAULT_BATCH_SIZE);
        batchSizeInput.value = state.settings.batchSize.toString();

        state.settings.batchInterval = await getStorageItem("BATCH_INTERVAL", config.DEFAULT_BATCH_INTERVAL);
        batchIntervalInput.value = state.settings.batchInterval.toString();

        // Initialize original settings string to current values
        originalSettingsString = JSON.stringify({
            skipDuration: state.settings.skipDuration,
            bookmarkCount: state.settings.bookmarkCount,
            batchSize: state.settings.batchSize,
            batchInterval: state.settings.batchInterval,
            baseUrl: state.settings.baseUrl
        });

        try {
            // Restore UI state if not a reset operation
            if (caller !== 'reset') {
                await restoreUIState();
                await checkServiceWorkerStatus();
            } else {
                counterDisplay.textContent = `0/${state.settings.bookmarkCount}`;
            }

            if (caller === 'reset') {
                showNotification('Reset Config Successfully!', 'success');
            } else {
                showNotification('Initialized Successfully!', 'success');
            }
        } catch (error) {
            Logger.error('Error ensuring Microsoft Rewards folder:', error);
            counterDisplay.textContent = "0/0";
        }

        // Set initial button states
        if (openBookmarkButton) {
            openBookmarkButton.textContent = 'Start Task';
        }
        if (applyChangesButton) {
            applyChangesButton.disabled = true; // Initially disabled until changes are made
        }

        // Check for unsaved changes after initialization
        checkForUnsavedChanges();
    } catch (error) {
        Logger.error('Error in initialize:', error);
        showNotification('Failed to initialize extension', 'error');
    }
}

/**
 * Check the service worker's current task status and sync UI state.
 * This ensures the popup UI matches the actual service worker state.
 */
async function checkServiceWorkerStatus(): Promise<void> {
    try {
        // Send a ping to check if service worker is alive and get current status
        chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Service worker not responding:', chrome.runtime.lastError);
                // If service worker is not responding, assume no task is running
                state.isProcessRunning = false;
                state.currentStatus = 'Idle';
                updateFormState();
                return;
            }

            // If service worker responds, check if there's an active task
            if (response && response.status === 'alive') {
                // Check if there's an active task using the dedicated status check
                chrome.runtime.sendMessage({ action: 'check-task-status' }, (statusResponse) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error checking task status:', chrome.runtime.lastError);
                        return;
                    }

                    if (statusResponse && statusResponse.success === false && statusResponse.status === 'idle') {
                        // No task is running, ensure UI is in idle state
                        if (state.currentStatus !== 'Idle') {
                            console.log('Syncing UI state: No task running, setting to Idle');
                            state.isProcessRunning = false;
                            state.currentStatus = 'Idle';

                            // Reset button text
                            if (openBookmarkButton) {
                                openBookmarkButton.textContent = 'Start Task';
                            }

                            updateFormState();
                        }
                    } else if (statusResponse && statusResponse.success === true && statusResponse.status === 'running') {
                        // Task is running, ensure UI reflects this
                        if (state.currentStatus === 'Idle') {
                            console.log('Syncing UI state: Task is running, setting to Executing');
                            state.isProcessRunning = true;
                            state.currentStatus = 'Executing';

                            // Update button text
                            if (openBookmarkButton) {
                                openBookmarkButton.textContent = 'Working...';
                            }

                            updateFormState();
                        }
                    }
                });
            }
        });
    } catch (error) {
        console.error('Error checking service worker status:', error);
    }
}

/**
 * Save the current UI state to storage for restoration when popup reopens.
 */
async function saveUIState(): Promise<void> {
    try {
        // Use state as primary source, DOM as fallback for user input
        const progressFromDOM = counterDisplay?.textContent;
        const timerFromDOM = timeRemaining?.textContent;
        const startButtonTextFromDOM = openBookmarkButton?.textContent;
        const startButtonDisabledFromDOM = openBookmarkButton?.disabled;
        const abortButtonDisabledFromDOM = abortTaskButton?.disabled;
        const resetButtonDisabledFromDOM = loadDefaultsButton?.disabled;

        // Update state with priority: State values first, then DOM values if different (user input), then defaults
        state.currentProgress = state.currentProgress || progressFromDOM || "0/0";
        state.currentTimer = state.currentTimer || timerFromDOM || "--:--";

        // Update button states with same priority logic
        state.buttonStates = {
            startButtonText: state.buttonStates.startButtonText || startButtonTextFromDOM || "Start Task",
            startButtonDisabled: state.buttonStates.startButtonDisabled ?? startButtonDisabledFromDOM ?? false,
            abortButtonDisabled: state.buttonStates.abortButtonDisabled ?? abortButtonDisabledFromDOM ?? true,
            resetButtonDisabled: state.buttonStates.resetButtonDisabled ?? resetButtonDisabledFromDOM ?? false,
        };

        // Save complete state to storage
        setStorageItem('UI_STATE', {
            isProcessRunning: state.isProcessRunning,
            currentStatus: state.currentStatus,

            currentProgress: state.currentProgress,
            currentTimer: state.currentTimer,
            inputFieldsLocked: state.inputFieldsLocked,
            isSync: state.isSync,
            buttonStates: state.buttonStates,
        });

        Logger.info('UI state saved to storage');
    } catch (error) {
        Logger.error('Error saving UI state:', error);
    }
}

/**
 * Restore the UI state from storage when popup reopens.
 */
async function restoreUIState(): Promise<void> {
    try {
        const savedState = await getStorageItem('UI_STATE', null) as any;

        if (savedState) {
            // Restore basic state
            state.isProcessRunning = savedState.isProcessRunning || false;
            state.currentStatus = savedState.currentStatus || 'Idle';

            state.currentProgress = savedState.currentProgress || "0/0";
            state.currentTimer = savedState.currentTimer || "--:--";
            state.inputFieldsLocked = savedState.inputFieldsLocked || false;
            state.isSync = savedState.isSync || false;

            if (savedState.buttonStates) {
                state.buttonStates = {
                    startButtonText: savedState.buttonStates.startButtonText || "Start Task",
                    startButtonDisabled: savedState.buttonStates.startButtonDisabled || false,
                    abortButtonDisabled: savedState.buttonStates.abortButtonDisabled || true,
                    resetButtonDisabled: savedState.buttonStates.resetButtonDisabled || false,
                };
            }

            // Apply UI state
            applyUIState();

            // Show notification if process is running
            if (state.isProcessRunning) {
                showNotification('Task is still running in the background', 'info');
            }

            Logger.info('UI state restored from storage');
        }
    } catch (error) {
        Logger.error('Error restoring UI state:', error);
    }
}

/**
 * Apply the current state to the UI elements.
 */
function applyUIState(): void {
    updateStatus(state.currentStatus);

    if (counterDisplay) {
        counterDisplay.textContent = state.currentProgress;
    }

    if (timeRemaining) {
        timeRemaining.textContent = state.currentTimer;
    }

    if (syncDisplay) {
        syncDisplay.textContent = state.isSync ? 'Sync' : 'Not Sync';
        syncDisplay.className = state.isSync ? 'sync' : 'not-sync';
    }

    if (openBookmarkButton) {
        openBookmarkButton.textContent = state.buttonStates.startButtonText;
        openBookmarkButton.disabled = state.currentStatus !== 'Idle';
    }

    if (abortTaskButton) {
        abortTaskButton.disabled = state.currentStatus === 'Idle';
    }

    if (loadDefaultsButton) {
        loadDefaultsButton.disabled = state.currentStatus !== 'Idle';
    }
}

/**
 * Update all form fields and buttons based on current status.
 * This function centralizes all UI state management.
 */
function updateFormState(): void {
    const isTaskRunning = state.currentStatus === 'Executing' || state.currentStatus === 'On-Pause';

    const formFields = [
        skipDurationInput,
        bookmarkCountInput,
        batchSizeInput,
        batchIntervalInput
    ];

    // Update form fields (excluding baseUrlTextbox which has special lock handling)
    formFields.forEach(field => {
        if (field) {
            field.disabled = isTaskRunning;
            field.style.opacity = isTaskRunning ? '0.6' : '1';
        }
    });

    // Handle baseUrlTextbox separately to account for lock state
    if (baseUrlTextbox) {
        const shouldDisable = isTaskRunning || state.settings.isBaseUrlLocked;
        baseUrlTextbox.disabled = shouldDisable;
        baseUrlTextbox.style.opacity = shouldDisable ? '0.6' : '1';
    }

    // Handle lock checkbox - disable when task is running
    if (lockBaseUrlCheckbox) {
        lockBaseUrlCheckbox.disabled = isTaskRunning;
        // Also disable the label to prevent clicking
        const lockLabel = lockBaseUrlCheckbox.nextElementSibling as HTMLElement;
        if (lockLabel) {
            lockLabel.style.pointerEvents = isTaskRunning ? 'none' : 'auto';
            lockLabel.style.opacity = isTaskRunning ? '0.6' : '1';
        }
    }

    // Update buttons
    if (openBookmarkButton) {
        openBookmarkButton.disabled = isTaskRunning;
    }

    if (loadDefaultsButton) {
        loadDefaultsButton.disabled = isTaskRunning;
    }

    if (abortTaskButton) {
        // Abort button is enabled only when task is running
        abortTaskButton.disabled = !isTaskRunning;
    }
}

// Listen for completion message from service worker
chrome.runtime.onMessage.addListener(async (message) => {
    // Handle task completion
    if (message.status === 'done' && message.action === 'start') {
        state.isProcessRunning = false;

        // Reset start button text
        if (openBookmarkButton) {
            openBookmarkButton.textContent = 'Start Task';
        }

        // Update status (this will automatically update all form fields and buttons)
        updateStatus('Idle');

        // Reset duration to default state when task is completed
        if (timeRemaining) {
            timeRemaining.textContent = "--:--";
        }
        showNotification('Task completed!', 'success');

        // Save final state
        await saveUIState();
    }

    // Handle bookmark automation progress updates
    if (message.action === 'automation-progress-update') {
        const { currentIndex, totalBookmarks, remainingTime } = message;
        if (counterDisplay) {
            counterDisplay.textContent = `${currentIndex}/${totalBookmarks}`;
        }

        updateStatus('Executing');
        updateTimer(remainingTime);
        await saveUIState();
    }

    // Handle batch pause notification
    if (message.action === 'batch-pause') {
        const { currentIndex, totalBookmarks, pauseDuration } = message;
        const pauseMinutes = Math.floor(pauseDuration / 60);
        const pauseSeconds = pauseDuration % 60;
        const pauseTime = `${pauseMinutes}:${pauseSeconds.toString().padStart(2, '0')}`;

        updateStatus('On-Pause');
        showNotification(`Batch completed! Pausing for ${pauseTime} before next batch...`, 'info');
        Logger.info(`Batch pause: ${currentIndex}/${totalBookmarks}, pausing for ${pauseDuration}s`);
    }

    // Handle abort completion (when service worker sends completion after abort)
    if (message.status === 'done' && message.action === 'start' && !state.isProcessRunning) {
        // This handles the case where the service worker sends completion after abort
        // We don't need to do anything since handleAbortTaskClick already reset the UI
        Logger.info('Received completion message after abort');
    }
});





