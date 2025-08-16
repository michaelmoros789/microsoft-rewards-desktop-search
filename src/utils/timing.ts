export interface TimingParams {
    totalBookmarks: number;
    currentIndex: number;
    skipDuration: number;
    batchSize: number;
    batchInterval: number;
}

export function computeTiming({
    totalBookmarks,
    currentIndex,
    skipDuration,
    batchSize,
    batchInterval,
}: TimingParams) {
    function getTotalDuration(bookmarks: number): number {
        let total = 0;
        let processed = 0;

        while (processed < bookmarks) {
            const batchCount = Math.min(batchSize, bookmarks - processed);
            total += batchCount * skipDuration;
            processed += batchCount;

            if (processed < bookmarks) {
                total += batchInterval;
            }
        }

        return total;
    }

    const totalDuration = getTotalDuration(totalBookmarks);
    const elapsed = getTotalDuration(currentIndex);
    const remainingTime = Math.max(totalDuration - elapsed, 0);

    return { totalDuration, remainingTime };
}
