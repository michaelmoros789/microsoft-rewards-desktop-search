/// <reference types="chrome" />

/**
 * Notification types with different priorities and behaviors
 */
export type NotificationType = 'success' | 'error' | 'warning' | 'info';

/**
 * Notification configuration
 */
interface NotificationConfig {
    /** Minimum time between notifications of the same type (ms) */
    debounceTime: number;
    /** How long to show the notification (ms) */
    displayTime: number;
    /** Maximum number of notifications to show at once */
    maxNotifications: number;
}

/**
 * Internal notification item
 */
interface NotificationItem {
    id: string;
    message: string;
    type: NotificationType;
    timestamp: number;
    element?: HTMLElement;
}

/**
 * Smart notification manager with debouncing and queuing
 */
export class NotificationManager {
    private static instance: NotificationManager;
    private queue: NotificationItem[] = [];
    private activeNotifications: HTMLElement[] = [];
    private lastNotificationTime: Record<NotificationType, number> = {
        success: 0,
        error: 0,
        warning: 0,
        info: 0
    };

    private config: NotificationConfig = {
        debounceTime: 1000, // 1 second between similar notifications
        displayTime: 3000,  // 3 seconds display time
        maxNotifications: 3
    };

    private constructor() { }

    /**
     * Get the singleton instance
     */
    public static getInstance(): NotificationManager {
        if (!NotificationManager.instance) {
            NotificationManager.instance = new NotificationManager();
        }
        return NotificationManager.instance;
    }

    /**
     * Show a notification with smart debouncing
     * @param message The message to display
     * @param type The type of notification
     * @param force Force show even if debounced (for errors)
     */
    public show(message: string, type: NotificationType = 'info', force: boolean = false): void {
        const now = Date.now();
        const lastTime = this.lastNotificationTime[type];
        const timeSinceLast = now - lastTime;

        // Check if we should debounce this notification
        if (!force && timeSinceLast < this.config.debounceTime) {
            // Update existing notification instead of creating new one
            this.updateExistingNotification(message, type);
            return;
        }

        // Create new notification
        const notification: NotificationItem = {
            id: this.generateId(),
            message,
            type,
            timestamp: now
        };

        this.queue.push(notification);
        this.lastNotificationTime[type] = now;
        this.processQueue();
    }

    /**
     * Show an error notification (always shows immediately)
     */
    public showError(message: string): void {
        this.show(message, 'error', true);
    }

    /**
     * Show a success notification
     */
    public showSuccess(message: string): void {
        this.show(message, 'success');
    }

    /**
     * Show a warning notification
     */
    public showWarning(message: string): void {
        this.show(message, 'warning');
    }

    /**
     * Show an info notification
     */
    public showInfo(message: string): void {
        this.show(message, 'info');
    }

    /**
     * Update existing notification instead of creating a new one
     */
    private updateExistingNotification(message: string, type: NotificationType): void {
        // Find the most recent notification of the same type
        const existingNotification = this.activeNotifications
            .reverse()
            .find(el => el.classList.contains(type));

        if (existingNotification) {
            // Update the message
            existingNotification.textContent = message;

            // Extend the display time
            this.extendNotificationTime(existingNotification);
        }
    }

    /**
     * Extend the display time of an existing notification
     */
    private extendNotificationTime(notification: HTMLElement): void {
        // Remove existing timeout and set a new one
        const timeoutId = (notification as any)._timeoutId;
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        const newTimeoutId = setTimeout(() => {
            this.removeNotification(notification);
        }, this.config.displayTime);

        (notification as any)._timeoutId = newTimeoutId;
    }

    /**
     * Process the notification queue
     */
    private processQueue(): void {
        while (this.queue.length > 0 && this.activeNotifications.length < this.config.maxNotifications) {
            const notification = this.queue.shift();
            if (notification) {
                this.displayNotification(notification);
            }
        }
    }

    /**
     * Display a notification on the page
     */
    private displayNotification(notification: NotificationItem): void {
        const element = document.createElement('div');
        element.className = `notification ${notification.type}`;
        element.textContent = notification.message;
        element.style.top = `${20 + (this.activeNotifications.length * (element.offsetHeight + 8))}px`;

        // Add to page
        document.body.appendChild(element);
        this.activeNotifications.push(element);

        // Show animation
        setTimeout(() => {
            element.classList.add('show');
        }, 10);

        // Set timeout to remove
        const timeoutId = setTimeout(() => {
            this.removeNotification(element);
        }, this.config.displayTime);

        // Store timeout ID for potential extension
        (element as any)._timeoutId = timeoutId;

        // Reposition all notifications
        this.repositionNotifications();
    }

    /**
     * Remove a notification from the page
     */
    private removeNotification(notification: HTMLElement): void {
        notification.classList.add('hide');

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }

            // Remove from active notifications
            const index = this.activeNotifications.indexOf(notification);
            if (index > -1) {
                this.activeNotifications.splice(index, 1);
            }

            // Reposition remaining notifications
            this.repositionNotifications();

            // Process queue for next notification
            this.processQueue();
        }, 550); // Match CSS transition time
    }

    /**
     * Reposition all active notifications
     */
    private repositionNotifications(): void {
        this.activeNotifications.forEach((notification, index) => {
            const topPosition = 20 + (index * (notification.offsetHeight + 8));
            notification.style.top = `${topPosition}px`;
        });
    }

    /**
     * Generate a unique ID for notifications
     */
    private generateId(): string {
        return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Clear all active notifications
     */
    public clearAll(): void {
        this.activeNotifications.forEach(notification => {
            this.removeNotification(notification);
        });
        this.queue = [];
    }

    /**
     * Update configuration
     */
    public updateConfig(config: Partial<NotificationConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

/**
 * Convenience function for backward compatibility
 * @deprecated Use NotificationManager.getInstance().show() instead
 */
export function showNotification(message: string, type: NotificationType = 'info'): void {
    NotificationManager.getInstance().show(message, type);
} 