/**
 * Logger utility for consistent error handling and debugging.
 * Logger calls are omitted in production builds for better performance.
 */
export class Logger {
    private static isDevelopment = process.env.NODE_ENV === 'development';

    static info(message: string, data?: any): void {
        if (!this.isDevelopment) return;
        console.log(`[INFO] ${message}`, data || '');
    }

    static warn(message: string, data?: any): void {
        if (!this.isDevelopment) return;
        console.warn(`[WARN] ${message}`, data || '');
    }

    static error(message: string, error?: any): void {
        if (!this.isDevelopment) return;
        console.error(`[ERROR] ${message}`, error || '');
    }
}