/**
 * Logger utility for consistent error handling and debugging.
 */
export class Logger {
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