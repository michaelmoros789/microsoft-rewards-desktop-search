/// <reference types="chrome" />

/**
 * Application state for the popup UI.
 */
type AppState = {
    /** Interval ID for the bookmark opening process */
    intervalId: ReturnType<typeof setInterval> | null;
    /** Whether the base URL is valid for Bing search */
    isBaseUrlValid: boolean;
    /** Last visited bookmark index */
    lastVisitedIndex: number;
    /** Delay (seconds) between opening bookmarks */
    skipDuration: number;
    /** Number of bookmarks to create/use */
    bookmarkCount: number;
    /** Bing search base URL */
    baseUrl: string;
    /** Whether the bookmark opening process is running */
    isProcessRunning: boolean;
};

// Constants for default and allowed values
const DEFAULT_SKIP_DURATION = 10;
const DEFAULT_BOOKMARK_COUNT = 30;
const MAX_BOOKMARK_COUNT = 100;
const MIN_BOOKMARK_COUNT = 1;
const MIN_SKIP_DURATION = 1;
const MAX_SKIP_DURATION = 60;

/**
 * Logger utility for consistent error handling and debugging.
 */
class Logger {
    static info(message: string, data?: any): void {
        console.log(`[INFO] ${message}`, data || '');
    }

    static warn(message: string, data?: any): void {
        console.warn(`[WARN] ${message}`, data || '');
    }

    static error(message: string, error?: any): void {
        console.error(`[ERROR] ${message}`, error || '');
    }
}

/**
 * Global state object for the popup UI.
 */
const state: AppState = {
    intervalId: null,
    isBaseUrlValid: false,
    lastVisitedIndex: 0,
    skipDuration: DEFAULT_SKIP_DURATION,
    bookmarkCount: DEFAULT_BOOKMARK_COUNT,
    baseUrl: "",
    isProcessRunning: false,
};

// DOM Elements
const counterDisplay = document.getElementById("counterDisplay") as HTMLElement;
const lastPosition = document.getElementById("lastPosition") as HTMLElement;
const baseUrlTextbox = document.getElementById("baseUrl") as HTMLInputElement;
const openBookmarkButton = document.getElementById("openBookmark") as HTMLButtonElement;
const resetProgressButton = document.getElementById("resetProgress") as HTMLButtonElement;
const validationStatus = document.getElementById("validationStatus") as HTMLElement;
const skipDurationInput = document.getElementById("skipDuration") as HTMLInputElement;
const bookmarkCountInput = document.getElementById("bookmarkCount") as HTMLInputElement;



// Access keywords from window object (populated by keywords.js)
const keywords = (window as any).keywords as string[];

/**
 * Show a user-friendly notification message.
 * @param message The message to display
 * @param type The type of notification (success, error, warning, info)
 */
function showNotification(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): void {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    // Add to page
    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

/**
 * Get a value from Chrome local storage, or set it to a fallback if not present.
 * @param key Storage key
 * @param fallbackValue Value to use if key is not present
 * @returns Promise resolving to the value
 */
function getStorageItem<T>(key: string, fallbackValue: T): Promise<T> {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.get([key], (result) => {
                if (chrome.runtime.lastError) {
                    Logger.error(`Storage get error for key ${key}:`, chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                    return;
                }

                if (result[key] === undefined) {
                    chrome.storage.local.set({ [key]: fallbackValue }, () => {
                        if (chrome.runtime.lastError) {
                            Logger.error(`Storage set error for key ${key}:`, chrome.runtime.lastError);
                            reject(chrome.runtime.lastError);
                            return;
                        }
                        resolve(fallbackValue);
                    });
                } else {
                    resolve(result[key] as T);
                }
            });
        } catch (error) {
            Logger.error(`Storage operation failed for key ${key}:`, error);
            reject(error);
        }
    });
}

/**
 * Validate that a URL is a Bing search URL with a q= or pq= parameter.
 * @param url The URL to validate
 * @returns True if valid, false otherwise
 */
function isValidUrlPattern(url: string): boolean {
    if (!url.startsWith("https://www.bing.com/search?")) return false;
    return /[?&](?!p)q=[^&]+|[?&]pq=[^&]+/.test(url);
}

/**
 * Update the UI to reflect the current base URL validation status.
 * @param url The base URL to validate
 */
function updateValidationStatus(url: string): void {
    state.isBaseUrlValid = isValidUrlPattern(url);

    if (state.isBaseUrlValid) {
        validationStatus.textContent = "Valid";
        validationStatus.className = "validation-status valid";
        openBookmarkButton.disabled = false;
    } else {
        validationStatus.textContent = "Invalid";
        validationStatus.className = "validation-status invalid";
        openBookmarkButton.disabled = true;
    }
}

/**
 * Replace the q= or pq= parameter in a Bing search URL with a new value.
 * @param url The base URL
 * @param value The new search query
 * @returns The updated URL
 */
function replaceQueryParam(url: string, value: string): string {
    const encodedValue = value.replace(/\s+/g, "+");
    let newUrl = url.replace(/([?&])(?!p)q=[^&]+/, `$1q=${encodedValue}`);
    if (newUrl === url) {
        newUrl = url.replace(/([?&])pq=[^&]+/, `$1pq=${encodedValue}`);
    }
    return newUrl;
}

/**
 * Validate and clamp the skip duration input.
 * @param value The input value
 * @returns A valid skip duration
 */
function validateAndSetSkipDuration(value: string): number {
    const num = parseInt(value);
    return isNaN(num) ? DEFAULT_SKIP_DURATION : Math.min(Math.max(num, MIN_SKIP_DURATION), MAX_SKIP_DURATION);
}

/**
 * Validate and clamp the bookmark count input.
 * @param value The input value
 * @returns A valid bookmark count
 */
function validateAndSetBookmarkCount(value: string): number {
    const num = parseInt(value);
    return isNaN(num) ? DEFAULT_BOOKMARK_COUNT : Math.min(Math.max(num, MIN_BOOKMARK_COUNT), MAX_BOOKMARK_COUNT);
}

/**
 * Update the UI and open the next bookmark in the process.
 * @param bookmarks List of bookmark nodes
 */
function updateStatusText(bookmarks: chrome.bookmarks.BookmarkTreeNode[]): void {
    if (state.lastVisitedIndex >= bookmarks.length) {
        clearInterval(state.intervalId!);
        state.isProcessRunning = false;
        showNotification('Bookmark automation completed!', 'success');
        Logger.info('Bookmark automation completed');
        return;
    }

    try {
        const bookmark = bookmarks[state.lastVisitedIndex];
        if (!bookmark.url) {
            Logger.warn(`Bookmark at index ${state.lastVisitedIndex} has no URL`);
            state.lastVisitedIndex++;
            return;
        }

        chrome.tabs.create({
            url: bookmark.url,
            active: false
        }, (tab) => {
            if (chrome.runtime.lastError) {
                Logger.error('Failed to create tab:', chrome.runtime.lastError);
                showNotification('Failed to open bookmark', 'error');
            } else {
                Logger.info(`Opened bookmark: ${bookmark.title}`);
            }
        });

        chrome.storage.local.set({ lastVisitedIndex: state.lastVisitedIndex }, () => {
            if (chrome.runtime.lastError) {
                Logger.error('Failed to save progress:', chrome.runtime.lastError);
            }
        });

        state.lastVisitedIndex++;
        counterDisplay.textContent = `${state.lastVisitedIndex} out of ${bookmarks.length}`;
        lastPosition.textContent = state.lastVisitedIndex.toString();
    } catch (error) {
        Logger.error('Error in updateStatusText:', error);
        showNotification('Error processing bookmark', 'error');
    }
}

/**
 * Get a shuffled array of unique keywords.
 * @param number Number of unique keywords to return
 * @returns Array of unique keywords
 */
function getUniqueWords(number: number): string[] {
    try {
        if (!keywords || !Array.isArray(keywords)) {
            Logger.error('Keywords not available or invalid');
            return [];
        }

        const uniqueWords = [...new Set(keywords)];
        for (let i = uniqueWords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [uniqueWords[i], uniqueWords[j]] = [uniqueWords[j], uniqueWords[i]];
        }
        return uniqueWords.slice(0, number);
    } catch (error) {
        Logger.error('Error getting unique words:', error);
        return [];
    }
}

/**
 * Handle input event for bookmark count field.
 * @param e Input event
 */
function handleBookmarkCountInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    const value = validateAndSetBookmarkCount(target.value);
    target.value = value.toString();
    state.bookmarkCount = value;
    chrome.storage.local.set({ BOOKMARK_COUNT: value }, () => {
        if (chrome.runtime.lastError) {
            Logger.error('Failed to save bookmark count:', chrome.runtime.lastError);
        }
    });
}

/**
 * Handle blur event for bookmark count field.
 * @param e Blur event
 */
function handleBookmarkCountBlur(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (!target.value) {
        target.value = DEFAULT_BOOKMARK_COUNT.toString();
        state.bookmarkCount = DEFAULT_BOOKMARK_COUNT;
        chrome.storage.local.set({ BOOKMARK_COUNT: DEFAULT_BOOKMARK_COUNT }, () => {
            if (chrome.runtime.lastError) {
                Logger.error('Failed to save default bookmark count:', chrome.runtime.lastError);
            }
        });
    }
}

/**
 * Handle input event for skip duration field.
 * @param e Input event
 */
function handleSkipDurationInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    const value = validateAndSetSkipDuration(target.value);
    target.value = value.toString();
    state.skipDuration = value;
    chrome.storage.local.set({ SKIP_DURATION: value }, () => {
        if (chrome.runtime.lastError) {
            Logger.error('Failed to save skip duration:', chrome.runtime.lastError);
        }
    });
}

/**
 * Handle blur event for skip duration field.
 * @param e Blur event
 */
function handleSkipDurationBlur(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (!target.value) {
        target.value = DEFAULT_SKIP_DURATION.toString();
        state.skipDuration = DEFAULT_SKIP_DURATION;
        chrome.storage.local.set({ SKIP_DURATION: DEFAULT_SKIP_DURATION }, () => {
            if (chrome.runtime.lastError) {
                Logger.error('Failed to save default skip duration:', chrome.runtime.lastError);
            }
        });
    }
}

/**
 * Handle input/blur event for base URL field.
 * @param e Input or blur event
 */
function handleBaseUrlInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    state.baseUrl = target.value;
    updateValidationStatus(state.baseUrl);
    chrome.storage.local.set({ BASE_URL: state.baseUrl }, () => {
        if (chrome.runtime.lastError) {
            Logger.error('Failed to save base URL:', chrome.runtime.lastError);
        }
    });
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

        showNotification('Resetting progress...', 'info');

        await emptyMicrosoftRewardsFolder();
        await createBingSearchBookmarks();

        chrome.storage.local.set({ lastVisitedIndex: 0 }, () => {
            if (chrome.runtime.lastError) {
                Logger.error('Failed to reset progress:', chrome.runtime.lastError);
                showNotification('Failed to reset progress', 'error');
            } else {
                initialize();
                showNotification('Progress reset successfully!', 'success');
            }
        });
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

document.getElementById("openBookmark")!.addEventListener("click", handleOpenBookmarkClick);
document.addEventListener("DOMContentLoaded", () => {
    Logger.info('Popup initialized');
    initialize();
});

/**
 * Initialize the popup UI by loading state from storage and updating the UI.
 */
async function initialize(): Promise<void> {
    try {
        state.baseUrl = await getStorageItem("BASE_URL", "");
        baseUrlTextbox.value = state.baseUrl;
        updateValidationStatus(state.baseUrl);

        state.skipDuration = await getStorageItem("SKIP_DURATION", DEFAULT_SKIP_DURATION);
        skipDurationInput.value = state.skipDuration.toString();

        state.bookmarkCount = await getStorageItem("BOOKMARK_COUNT", DEFAULT_BOOKMARK_COUNT);
        bookmarkCountInput.value = state.bookmarkCount.toString();

        state.lastVisitedIndex = await getStorageItem("lastVisitedIndex", 0);
        lastPosition.textContent = state.lastVisitedIndex.toString();

        // Ensure Microsoft Rewards folder exists
        chrome.bookmarks.getTree((tree) => {
            if (chrome.runtime.lastError) {
                Logger.error('Failed to get bookmark tree:', chrome.runtime.lastError);
                return;
            }

            const bookmarkBar = tree[0].children?.[0];
            const hasFolder = bookmarkBar?.children?.some((node) => node.title === "Microsoft Rewards");

            if (!hasFolder) {
                chrome.bookmarks.create({
                    parentId: bookmarkBar?.id,
                    index: 0,
                    title: "Microsoft Rewards",
                }, (folder) => {
                    if (chrome.runtime.lastError) {
                        Logger.error('Failed to create Microsoft Rewards folder:', chrome.runtime.lastError);
                    } else {
                        Logger.info('Microsoft Rewards folder created');
                    }
                });
            }
        });

        // Update progress display
        chrome.bookmarks.search({ title: "Microsoft Rewards" }, (folders) => {
            if (chrome.runtime.lastError) {
                Logger.error('Failed to search for Microsoft Rewards folder:', chrome.runtime.lastError);
                return;
            }

            if (folders.length) {
                const folderId = folders[0].id;
                chrome.bookmarks.getChildren(folderId, (bookmarks) => {
                    if (chrome.runtime.lastError) {
                        Logger.error('Failed to get bookmark children:', chrome.runtime.lastError);
                        return;
                    }

                    counterDisplay.textContent = `${state.lastVisitedIndex} out of ${bookmarks.length}`;
                });
            } else {
                counterDisplay.textContent = "0 out of 0";
            }
        });
    } catch (error) {
        Logger.error('Error in initialize:', error);
        showNotification('Failed to initialize extension', 'error');
    }
}

/**
 * Handle click event for the Start/Resume Script button.
 * Starts the bookmark opening process if the base URL is valid and not already running.
 */
function handleOpenBookmarkClick(): void {
    if (!state.isBaseUrlValid) {
        showNotification('Base URL is not valid', 'error');
        return;
    }
    if (state.isProcessRunning) {
        showNotification('Process is already running. Please wait for it to complete.', 'warning');
        return;
    }

    chrome.bookmarks.search({ title: "Microsoft Rewards" }, (folders) => {
        if (chrome.runtime.lastError) {
            Logger.error('Failed to search for Microsoft Rewards folder:', chrome.runtime.lastError);
            showNotification('Failed to access bookmarks', 'error');
            return;
        }

        const folderId = folders[0]?.id;
        if (!folderId) {
            showNotification('Microsoft Rewards folder not found', 'error');
            return;
        }

        chrome.bookmarks.getChildren(folderId, (bookmarks) => {
            if (chrome.runtime.lastError) {
                Logger.error('Failed to get bookmark children:', chrome.runtime.lastError);
                showNotification('Failed to access bookmarks', 'error');
                return;
            }

            if (!bookmarks.length) {
                showNotification('No bookmarks found. Please reset progress first.', 'warning');
                return;
            }

            state.isProcessRunning = true;
            const delay = state.skipDuration * 1000;
            state.intervalId = setInterval(() => updateStatusText(bookmarks), delay);
            showNotification('Bookmark automation started!', 'success');
            Logger.info('Bookmark automation started');
        });
    });
}

/**
 * Remove all bookmarks from the Microsoft Rewards folder.
 */
function emptyMicrosoftRewardsFolder(): Promise<void> {
    return new Promise((resolve, reject) => {
        chrome.bookmarks.search({ title: "Microsoft Rewards" }, (folders) => {
            if (chrome.runtime.lastError) {
                Logger.error('Failed to search for Microsoft Rewards folder:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
            }

            const folderId = folders[0]?.id;
            if (!folderId) {
                Logger.warn('Microsoft Rewards folder not found for emptying');
                resolve();
                return;
            }

            chrome.bookmarks.getChildren(folderId, (bookmarks) => {
                if (chrome.runtime.lastError) {
                    Logger.error('Failed to get bookmark children:', chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                    return;
                }

                let removedCount = 0;
                const totalBookmarks = bookmarks.length;

                if (totalBookmarks === 0) {
                    resolve();
                    return;
                }

                bookmarks.forEach((bookmark) => {
                    chrome.bookmarks.remove(bookmark.id, () => {
                        if (chrome.runtime.lastError) {
                            Logger.error('Failed to remove bookmark:', chrome.runtime.lastError);
                        } else {
                            removedCount++;
                            Logger.info(`Removed bookmark: ${bookmark.title}`);
                        }

                        if (removedCount === totalBookmarks) {
                            Logger.info(`Successfully removed ${removedCount} bookmarks`);
                            resolve();
                        }
                    });
                });
            });
        });
    });
}

/**
 * Create Bing search bookmarks in the Microsoft Rewards folder using unique keywords.
 */
async function createBingSearchBookmarks(): Promise<void> {
    return new Promise((resolve, reject) => {
        const uniqueWords = getUniqueWords(state.bookmarkCount);
        const _baseUrl = state.baseUrl;

        if (!uniqueWords.length) {
            reject(new Error('No keywords available'));
            return;
        }

        chrome.bookmarks.search({ title: "Microsoft Rewards" }, (folders) => {
            if (chrome.runtime.lastError) {
                Logger.error('Failed to search for Microsoft Rewards folder:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
            }

            const folderId = folders[0]?.id;
            if (!folderId) {
                Logger.error("Microsoft Rewards folder not found");
                reject(new Error('Microsoft Rewards folder not found'));
                return;
            }

            let createdCount = 0;
            const totalWords = uniqueWords.length;

            uniqueWords.forEach((word) => {
                const url = replaceQueryParam(_baseUrl, word);
                chrome.bookmarks.create({
                    parentId: folderId,
                    title: word,
                    url: url,
                }, (bookmark) => {
                    if (chrome.runtime.lastError) {
                        Logger.error(`Failed to create bookmark for "${word}":`, chrome.runtime.lastError);
                    } else {
                        createdCount++;
                        Logger.info(`Created bookmark: ${word}`);
                    }

                    if (createdCount === totalWords) {
                        Logger.info(`Successfully created ${createdCount} bookmarks`);
                        resolve();
                    }
                });
            });
        });
    });
}
