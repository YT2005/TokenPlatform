import { ipcMain } from 'electron'
import * as http from 'http'
import * as https from 'https'
import { URL } from 'url'
import { encryptedDB } from "./database/encrypted-db";
import crypto from 'crypto';
// 请求参数接口
interface IpcRequest {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
    timeout?: number
}

// 响应结果接口
interface IpcResponse {
    status: number
    statusText: string
    headers: Record<string, string>
    body: string
    time: number
    traceId?: string
}

// 保存请求记录到数据库接口

// interface RequestRecord {
//     traceId: string
//     url: string
//     method: string
//     requestHeaders: Record<string, string>
//     requestBody?: string
//     responseStatus: number
//     responseHeaders: Record<string, string>
//     responseBody: string
//     createdAt: number
// }

/**
 * 发起 HTTP/HTTPS 请求
 */

function headersToRecord(headers: http.OutgoingHttpHeaders): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
        if (value === undefined) continue
        if (Array.isArray(value)) {
            result[key] = value.join(', ')
        } else if (typeof value === 'number') {
            result[key] = value.toString()
        } else {
            result[key] = value
        }
    }
    return result
}

async function performRequest(params: IpcRequest): Promise<IpcResponse> {
    const startTime = Date.now()
    const { url, method, headers, body, timeout = 30000 } = params

    // 解析 URL，判断使用 http 还是 https
    const parsedUrl = new URL(url)
    const isHttps = parsedUrl.protocol === 'https:'
    const requestModule = isHttps ? https : http

    // TraceID 生成与注入
    const traceId = generateTraceId()
    // 构建请求头，注入 TraceID
    const requestHeaders: http.OutgoingHttpHeaders = {
        ...headers,
        'Host': parsedUrl.host,
    }
    if (!requestHeaders['X-Trace-Id'] && !requestHeaders['x-trace-id']) {
        requestHeaders['X-Trace-Id'] = traceId
    }

    // 添加 Content-Length（如有 Body）
    if (body && !requestHeaders['Content-Length']) {
        requestHeaders['Content-Length'] = Buffer.byteLength(body)
    }
    // 构建请求选项
    const options: http.RequestOptions = {
        method: method || 'GET',
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers: requestHeaders,
        timeout: timeout,
        // 开发环境忽略证书错误（按需）
        // rejectUnauthorized: process.env.NODE_ENV !== 'development',
    }

    // 查询该域名是否有托管的 Token
    const domain = parsedUrl.hostname
    console.log(`[RequestHandler] search: ${domain}`)
    const storedToken = encryptedDB.getToken(domain)
    console.log(`[RequestHandler] get Token: ${storedToken ? 'alive' : 'no'}`)
    if (storedToken) {
        // 假设存储的是 Bearer Token
        options.headers = options.headers || {}
        options.headers['Authorization'] = `Bearer ${storedToken}`
        console.log(`[RequestHandler] 为域名 ${domain} 注入 Authorization 头`)
    }

    return new Promise((resolve, reject) => {
        const req = requestModule.request(options, (res) => {
            const chunks: Buffer[] = []

            res.on('data', (chunk: Buffer) => {chunks.push(chunk)})

            res.on('end', async () => {
                const responseTime = Date.now() - startTime
                const responseBody = Buffer.concat(chunks)

                // 尝试解析为字符串（处理非 UTF-8 时降级为 base64 或提示）
                let bodyString: string
                try {
                    bodyString = responseBody.toString('utf-8')
                } catch {
                    bodyString = `[Binary Data: ${responseBody.length} bytes]`
                }

                // 转换响应头为普通对象
                const responseHeaders: Record<string, string> = {}
                for (const [key, value] of Object.entries(res.headers)) {
                    if (value !== undefined) {
                        responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value
                    }
                }

                const response: IpcResponse ={
                    status: res.statusCode || 0,
                    statusText: res.statusMessage || '',
                    headers: responseHeaders,
                    body: bodyString,
                    time: responseTime,
                    traceId: traceId
                }

                // 存储请求记录到数据库
                const finalHeaders =  { ...headers, ...headersToRecord((options.headers || {} ) as http.OutgoingHttpHeaders) }
                try {
                    encryptedDB.saveRequestRecord({
                        traceId,
                        url,
                        method,
                        requestHeaders: finalHeaders,
                        requestBody: body,
                        responseStatus: response.status,
                        responseHeaders: response.headers,
                        responseBody: response.body,
                        responseTime: response.time,
                        createdAt: Date.now(),
                    })
                } catch (dbError) {
                    console.error('[RequestHandler] 保存请求记录失败:', dbError)
                }
                resolve({
                    status: res.statusCode || 0,
                    statusText: res.statusMessage || '',
                    headers: responseHeaders,
                    body: bodyString,
                    time: responseTime,
                    traceId
                })
            })

            res.on('error', (err) => {
                reject(new Error(`响应错误: ${err.message}`))
            })
        })

        req.on('error', (err) => {
            reject(new Error(`请求失败: ${err.message}`))
        })

        req.on('timeout', () => {
            req.destroy()
            reject(new Error(`请求超时 (${timeout}ms)`))
        })

        // 写入请求体
        if (body) {
            req.write(body)
        }
        req.end()
    })
}

/**
 * 生成符合 W3C Trace Context 的 TraceID
 *  * 格式：32 位十六进制字符串（16 字节）
 */
function generateTraceId(): string {

     return crypto.randomBytes(16).toString('hex')
}


// 注册 IPC 处理器
export function registerRequestHandler() {

    ipcMain.handle('http:request', async (event, params: IpcRequest) => {
        try {
            console.log(`[主进程] 收到请求: ${params.method} ${params.url}`)
            const response = await performRequest(params)
            console.log(`[主进程] 请求完成: ${response.status} ${response.time}ms`)
            return response
        } catch (error: any) {
            console.error(`[主进程] 请求失败:`, error.message)
            // 返回错误格式的响应，避免渲染进程报 unhandled rejection
            return {
                status: 0,
                statusText: error.message,
                headers: {},
                body: '',
                time: 0,
                error: error.message
            }
        }
    })
    ipcMain.handle('vault:saveToken',  (_, domain: string, token: string) => {
         encryptedDB.saveToken(domain, token)
    })

    ipcMain.handle('vault:getDomains',  () => {
        return  encryptedDB.getAllDomains()
    })

    ipcMain.handle('vault:deleteToken',  (_, domain: string) => {
         encryptedDB.deleteToken(domain)
    })
}