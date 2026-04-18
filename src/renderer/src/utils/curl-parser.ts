
export function parseCurl(curl: string): { method: string; url: string; headers: Record<string, string>; body?: string } | null {
    // 简化版正则解析，可后续增强
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