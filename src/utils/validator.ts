import { config } from "../config";

/**
 * Validate that a URL is a Bing search URL with a q= or pq= parameter.
 * @param url The URL to validate
 * @returns True if valid, false otherwise
 */
export function isValidUrlPattern(url: string): boolean {
    if (!url.startsWith("https://www.bing.com/search?")) return false;
    return /[?&](?!p)q=[^&]+|[?&]pq=[^&]+/.test(url);
}

/**
 * Validate and clamp the skip duration input.
 * @param value The input value
 * @returns A valid skip duration
 */
export function validateSkipDuration(value: string): number {
    const num = parseInt(value);
    return isNaN(num) ? config.DEFAULT_SKIP_DURATION : Math.min(Math.max(num, config.MIN_SKIP_DURATION), config.MAX_SKIP_DURATION);
}

/**
 * Validate and clamp the bookmark count input.
 * @param value The input value
 * @returns A valid bookmark count
 */
export function validateBookmarkCount(value: string): number {
    const num = parseInt(value);
    return isNaN(num) ? config.DEFAULT_BOOKMARK_COUNT : Math.min(Math.max(num, config.MIN_BOOKMARK_COUNT), config.MAX_BOOKMARK_COUNT);
}