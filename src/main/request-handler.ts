import { ipcMain } from 'electron'
import * as http from 'http'
import * as https from 'https'
import { URL } from 'url'
import { encryptedDB } from "./database/encrypted-db";
import { fetchLogsByTraceId } from './services/log-services'
import crypto from 'crypto';
import {createLLMAdapter} from "./services/llm-factory";
import {DiagnosisContext} from "./services/llm-adapter";
import {replaceVariables, replaceVariablesInObject} from "./services/variable-replacer";
import {generateOpenAPISpec} from "./services/openapi-generator";
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
    let { url, method, headers, body, timeout = 30000 } = params

    // 获取当前激活环境的变量
    const envVars = encryptedDB.getActiveEnvironmentVariables()

    // 替换 URL 中的变量
    url = replaceVariables(url, envVars)

    // 替换 Headers 中的变量（key 和 value）
    const replacedHeaders: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
        const replacedKey = replaceVariables(key, envVars)
        replacedHeaders[replacedKey] = replaceVariables(value, envVars)
    }
    headers = replacedHeaders

    // 替换 Body 中的变量（如果是 JSON 字符串）
    if (body) {
        try {
            const parsed = JSON.parse(body)
            const replaced = replaceVariablesInObject(parsed, envVars)
            body = JSON.stringify(replaced)
        } catch {
            // 非 JSON 则直接字符串替换
            body = replaceVariables(body, envVars)
        }
    }
    // 解析 URL，判断使用 http 还是 https
    const parsedUrl = new URL(url)
    const isHttps = parsedUrl.protocol === 'https:'
    const requestModule = isHttps ? https : http

    // TraceID 生成与注入
    const traceId = generateTraceId()
    console.log(`[RequestHandler] create TraceID: ${traceId}`)
    // 构建请求头，注入 TraceID
    const requestHeaders: http.OutgoingHttpHeaders = {
        ...headers,
        'x-Trace-Id': traceId,
        'Host': parsedUrl.host,
    }

    // 添加 Content-Length（如有 Body）
    if (body && !requestHeaders['Content-Length']) {
        requestHeaders['Content-Length'] = Buffer.byteLength(body)
    }
    console.log(`[RequestHandler] 最终请求头:`, requestHeaders)
    // 构建请求选项
    const options: http.RequestOptions = {
        method: method || 'GET',
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers: requestHeaders,
        timeout: timeout,
        agent: false,

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
        console.log(`[RequestHandler] inject Authorization head into ${domain}  `)
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
                console.log(`[RequestHandler] 响应体预览 (前200字符): ${bodyString.substring(0, 200)}`)

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
    // 环境 CRUD
    ipcMain.handle('env:getAll', () => encryptedDB.getAllEnvironments())
    ipcMain.handle('env:create', (_, name: string, desc?: string) => encryptedDB.createEnvironment(name, desc))
    ipcMain.handle('env:update', (_, id: number, name: string, desc?: string) => encryptedDB.updateEnvironment(id, name, desc))
    ipcMain.handle('env:delete', (_, id: number) => encryptedDB.deleteEnvironment(id))
    ipcMain.handle('env:setDefault', (_, id: number) => encryptedDB.setDefaultEnvironment(id))

    // 变量 CRUD
    ipcMain.handle('env:getVariables', (_, envId: number) => encryptedDB.getVariablesForEnvironment(envId))
    ipcMain.handle('env:saveVariable', (_, envId: number, key: string, value: string, encrypted: boolean) =>
        encryptedDB.saveVariable(envId, key, value, encrypted))
    ipcMain.handle('env:deleteVariable', (_, envId: number, key: string) => encryptedDB.deleteVariable(envId, key))
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
    ipcMain.handle('logs:fetchByTraceId', async (_, traceId: string) => {
        console.log(`[主进程] 查询日志: TraceID=${traceId}`)
        return await fetchLogsByTraceId(traceId)
    })

    ipcMain.handle('ai:diagnose', async (_, context: DiagnosisContext) => {
        console.log('[AI] 开始诊断，状态码:', context.response.status)
        try {
            const adapter = await createLLMAdapter()
            console.log('[AI] 使用适配器:', adapter.name)
            const result = await adapter.analyzeError(context)
            return { success: true, result }
        } catch (error: any) {
            console.error('[AI] 诊断失败:', error)
            return {
                success: false,
                error: error.message || '未知错误',
                errorType: error.type || 'unknown'
            }
        }
    })
    // 保存 LLM 配置
    ipcMain.handle('settings:saveLLMConfig', (_, config: {
        provider: string;
        apiKey?: string
        keyType?: 'deepseek' | 'zhipu'
    }) => {
        encryptedDB.saveSetting('llm.provider', config.provider,true)
        if (config.apiKey && config.keyType) {
            const keyMap: Record<string, string> = {
                deepseek: 'llm.deepseek.apiKey',
                zhipu: 'llm.zhipu.apiKey'
            }
            const dbKey = keyMap[config.keyType]
            if (dbKey) {
                encryptedDB.saveSetting(dbKey, config.apiKey, true)
            }
        }
    })
    // 获取 LLM 配置
    ipcMain.handle('settings:getLLMConfig', () => {
        const provider = encryptedDB.getSetting('llm.provider') || 'rule'
        let hasApiKey = false
        if (provider === 'deepseek') {
            hasApiKey = !!encryptedDB.getSetting('llm.deepseek.apiKey')
        } else if (provider === 'zhipu') {
            hasApiKey = !!encryptedDB.getSetting('llm.zhipu.apiKey')
        }
        return { provider, hasApiKey }
    })

    ipcMain.handle('export:openapi', async (_, domainFilter?: string) => {
        return await generateOpenAPISpec(domainFilter)
    })

}