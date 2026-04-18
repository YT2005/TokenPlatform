// src/main/services/log-service.ts
import axios from 'axios'

const LOKI_URL = 'http://localhost:3100'

export interface LogEntry {
    timestamp: string
    line: string
    level?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
}

/**
 * 根据 TraceID 查询 Loki 中的日志
 * @param traceId 32位十六进制 TraceID
 * @param lookbackHours 回溯时间（小时），默认1小时
 */
export async function fetchLogsByTraceId(
    traceId: string,
    lookbackHours: number = 1
): Promise<LogEntry[]> {
    const query = `{job="docker_containers"} |= \`${traceId}\``
    const start = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString()
    const end = new Date().toISOString()

    try {
        const response = await axios.get(`${LOKI_URL}/loki/api/v1/query_range`, {
            params: {
                query,
                start,
                end,
                limit: 100,
                direction: 'forward'
            }
        })

        const result = response.data.data.result
        if (!result || result.length === 0) {
            return []
        }

        // 解析 Loki 返回的 streams
        const entries: LogEntry[] = []
        for (const stream of result) {
            for (const entry of stream.values) {
                const [timestamp, line] = entry
                // 跳过 Loki 自身日志（包含 "component=querier" 等）
                if (line.includes('component=querier') || line.includes('msg="executing query"')) {
                    continue
                }
                // 从日志行中尝试提取级别
                const levelMatch = line.match(/\[(INFO|WARN|ERROR|DEBUG)\]/i)
                entries.push({
                    timestamp: new Date(parseInt(timestamp) / 1000000).toISOString(),
                    line,
                    level: levelMatch ? (levelMatch[1].toUpperCase() as any) : undefined
                })
            }
        }
        return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    } catch (error) {
        console.error('[LogService] 查询 Loki 失败:', error)
        return []
    }
}