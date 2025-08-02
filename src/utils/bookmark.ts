import { Logger } from "./logger";
import { getUniqueWords } from "./keyword";
import { replaceQueryParam } from "./url";

/**
 * Utility class for managing Microsoft Rewards bookmarks.
 * All methods perform fresh searches to ensure data consistency.
 */
export class MicrosoftRewardsBookmarks {
    private static readonly FOLDER_TITLE = "Microsoft Rewards";

    /**
     * Search for the Microsoft Rewards folder.
     * @returns Promise that resolves to the folder ID, or null if folder doesn't exist
     */
    private static async findFolder(): Promise<string | null> {
        return new Promise((resolve) => {
            chrome.bookmarks.search({ title: this.FOLDER_TITLE }, (folders) => {
                if (chrome.runtime.lastError) {
                    Logger.error('Failed to search for Microsoft Rewards folder:', chrome.runtime.lastError);
                    resolve(null);
                    return;
                }

                resolve(folders.length > 0 ? folders[0].id : null);
            });
        });
    }

    /**
     * Get children of a folder by ID.
     * @param folderId The folder ID to get children from
     * @returns Promise that resolves to an array of bookmarks
     */
    private static async getFolderChildren(folderId: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
        return new Promise((resolve) => {
            chrome.bookmarks.getChildren(folderId, (bookmarks) => {
                if (chrome.runtime.lastError) {
                    Logger.error('Failed to get bookmark children:', chrome.runtime.lastError);
                    resolve([]);
                    return;
                }

                resolve(bookmarks);
            });
        });
    }

    /**
     * Ensure the Microsoft Rewards folder exists in the bookmark bar.
     * Creates the folder if it doesn't exist.
     */
    static async ensureFolder(): Promise<void> {
        return new Promise((resolve, reject) => {
            chrome.bookmarks.getTree((tree) => {
                if (chrome.runtime.lastError) {
                    Logger.error('Failed to get bookmark tree:', chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                    return;
                }

                const bookmarkBar = tree[0].children?.[0];
                const hasFolder = bookmarkBar?.children?.some((node) => node.title === this.FOLDER_TITLE);

                if (!hasFolder) {
                    chrome.bookmarks.create({
                        parentId: bookmarkBar?.id,
                        index: 0,
                        title: this.FOLDER_TITLE,
                    }, (folder) => {
                        if (chrome.runtime.lastError) {
                            Logger.error('Failed to create Microsoft Rewards folder:', chrome.runtime.lastError);
                            reject(chrome.runtime.lastError);
                        } else {
                            Logger.info('Microsoft Rewards folder created');
                            resolve();
                        }
                    });
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Get the Microsoft Rewards folder ID.
     * @returns Promise that resolves to the folder ID, or null if folder doesn't exist
     */
    static async getFolderId(): Promise<string | null> {
        return this.findFolder();
    }

    /**
     * Get all bookmarks from the Microsoft Rewards folder.
     * @returns Promise that resolves to an array of bookmarks, or empty array if folder doesn't exist
     */
    static async getBookmarks(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
        const folderId = await this.findFolder();
        if (!folderId) {
            return [];
        }
        return this.getFolderChildren(folderId);
    }

    /**
     * Get the count of bookmarks in the Microsoft Rewards folder.
     * @returns Promise that resolves to the number of bookmarks, or 0 if folder doesn't exist
     */
    static async getBookmarkCount(): Promise<number> {
        const bookmarks = await this.getBookmarks();
        return bookmarks.length;
    }

    /**
     * Remove all bookmarks from the Microsoft Rewards folder.
     */
    static async emptyFolder(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.findFolder().then((folderId) => {
                if (!folderId) {
                    Logger.warn('Microsoft Rewards folder not found for emptying');
                    resolve();
                    return;
                }

                this.getFolderChildren(folderId).then((bookmarks) => {
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
     * @param bookmarkCount Number of bookmarks to create
     * @param baseUrl Base URL for Bing searches
     * @param keywords Array of keywords to use for searches
     */
    static async createBingSearchBookmarks(
        bookmarkCount: number,
        baseUrl: string,
        keywords: string[]
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const uniqueWords = getUniqueWords(bookmarkCount, keywords);

            if (!uniqueWords.length) {
                reject(new Error('No keywords available'));
                return;
            }

            if (baseUrl.trim() === "") {
                this.emptyFolder().then(() => {
                    resolve();
                }).catch(reject);
                return;
            }

            this.getFolderId().then((folderId) => {
                if (!folderId) {
                    Logger.error("Microsoft Rewards folder not found");
                    reject(new Error('Microsoft Rewards folder not found'));
                    return;
                }

                let createdCount = 0;
                const totalWords = uniqueWords.length;
                uniqueWords.forEach((word) => {
                    const url = replaceQueryParam(baseUrl, word);
                    chrome.bookmarks.create({
                        parentId: folderId,
                        title: word,
                        url,
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
}

// Legacy function exports for backward compatibility
export const emptyMicrosoftRewardsFolder = MicrosoftRewardsBookmarks.emptyFolder;
export const ensureMicrosoftRewardsFolder = MicrosoftRewardsBookmarks.ensureFolder;
export const getMicrosoftRewardsBookmarkCount = MicrosoftRewardsBookmarks.getBookmarkCount;
export const getMicrosoftRewardsFolderId = MicrosoftRewardsBookmarks.getFolderId;
export const getMicrosoftRewardsBookmarks = MicrosoftRewardsBookmarks.getBookmarks;