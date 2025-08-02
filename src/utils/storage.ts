import { Logger } from "./logger"

/**
 * Get a value from Chrome local storage, or set it to a fallback if not present.
 * @param key Storage key
 * @param fallbackValue Value to use if key is not present
 * @returns Promise resolving to the value
 */
export function getStorageItem<T>(key: string, fallbackValue: T): Promise<T> {
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
 * Set a value in Chrome local storage.
 * @param key Storage key
 * @param value Value to store
 */
export function setStorageItem<T>(key: string, value: T): void {
    chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
            Logger.error(`Storage set error for key ${key}:`, chrome.runtime.lastError);
        }
    });
}