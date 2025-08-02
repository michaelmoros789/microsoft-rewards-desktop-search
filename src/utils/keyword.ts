import { Logger } from "./logger";
/**
 * Get a shuffled array of unique keywords.
 * @param number Number of unique keywords to return
 * @param keywords Array of keywords to filter
 * @returns Array of unique keywords
 */
export function getUniqueWords(number: number, keywords: string[]): string[] {
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