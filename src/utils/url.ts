/**
 * Replace the q= or pq= parameter in a Bing search URL with a new value.
 * @param url The base URL
 * @param value The new search query
 * @returns The updated URL
 */
export function replaceQueryParam(url: string, value: string): string {
    const encodedValue = value.replace(/\s+/g, "+");
    let newUrl = url.replace(/([?&])(?!p)q=[^&]+/, `$1q=${encodedValue}`);
    if (newUrl === url) {
        newUrl = url.replace(/([?&])pq=[^&]+/, `$1pq=${encodedValue}`);
    }
    return newUrl;
}