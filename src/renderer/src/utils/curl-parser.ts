export interface ParsedCurl {
    method: string
    url: string
    headers: Record<string, string>
    body?: string
}
export function parseCurl(curl: string): ParsedCurl | null {
    if (!curl.trim().startsWith('curl')) return null

    // 正则解析
    const methodMatch = curl.match(/-X\s+(\w+)/)
    const urlMatch = curl.match(/curl\s+(?:-X\s+\w+\s+)?['"]?([^'"\s]+)['"]?/)
    const headerMatches = [...curl.matchAll(/-H\s+['"]([^'"]+)['"]/g)]
    const dataMatch = curl.match(/--data(?:-raw|-binary)?\s+['"]([^'"]+)['"]/)

    if (!urlMatch) return null

    const headers: Record<string, string> = {}
    headerMatches.forEach(m => {
        const [key, value] = m[1].split(/:\s*/)
        if (key && value) headers[key] = value
    })

    return {
        method: methodMatch ? methodMatch[1] : 'GET',
        url: urlMatch[1],
        headers,
        body: dataMatch ? dataMatch[1] : undefined
    }
}