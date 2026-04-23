import { encryptedDB } from '../database/encrypted-db'

interface GroupedRequest {
    method: string
    path: string
    requests: any[]
    queryParams: Map<string, Set<string>>
    pathParams: Set<string>
    requestBodies: any[]
    responseBodies: Record<string, any[]>  // 按状态码分组
}

// 从 URL 提取路径（不含协议和域名）
function extractPath(url: string): string {
    try {
        const parsed = new URL(url)
        return parsed.pathname
    } catch {
        return url.replace(/^https?:\/\/[^/]+/, '')
    }
}

// 推断 JSON Schema（简化版，实际可更精细）
function inferSchema(samples: any[]): any {
    if (samples.length === 0) return { type: 'object' }

    const schema: any = { type: 'object', properties: {} }
    const merged = samples.reduce((acc, cur) => {
        if (typeof cur === 'object' && cur !== null && !Array.isArray(cur)) {
            Object.assign(acc, cur)
        }
        return acc
    }, {})

    for (const [key, value] of Object.entries(merged)) {
        const type = typeof value
        if (type === 'string') schema.properties[key] = { type: 'string', example: value }
        else if (type === 'number') schema.properties[key] = { type: 'number', example: value }
        else if (type === 'boolean') schema.properties[key] = { type: 'boolean', example: value }
        else if (Array.isArray(value)) {
            schema.properties[key] = { type: 'array', items: { type: 'object' } }
        } else if (type === 'object') {
            schema.properties[key] = { type: 'object', properties: {} }
        }
    }
    return schema
}

// 解析查询参数
function parseQueryParams(url: string): Map<string, string> {
    const params = new Map<string, string>()
    try {
        const parsed = new URL(url)
        parsed.searchParams.forEach((value, key) => params.set(key, value))
    } catch {}
    return params
}

// 检测路径参数（如 /users/:id 或 /users/{id}）
function detectPathParams(path: string): Set<string> {
    const params = new Set<string>()
    // 匹配 :param 格式
    const colonMatches = path.match(/:([^/]+)/g)
    if (colonMatches) {
        colonMatches.forEach(m => params.add(m.slice(1)))
    }
    // 匹配 {param} 格式
    const braceMatches = path.match(/{([^}]+)}/g)
    if (braceMatches) {
        braceMatches.forEach(m => params.add(m.slice(1, -1)))
    }
    return params
}

// 主生成函数
export async function generateOpenAPISpec(domainFilter?: string): Promise<any> {
    const records = encryptedDB.getSuccessfulRequests(domainFilter)
    if (records.length === 0) {
        throw new Error('没有找到成功的请求记录')
    }

    // 按域名分组
    const servers: Set<string> = new Set()
    const groupedByPath: Map<string, GroupedRequest> = new Map()

    for (const req of records) {
        try {
            const url = req.url
            const parsed = new URL(url)
            const domain = parsed.origin
            servers.add(domain)
            const path = parsed.pathname
            const method = req.method.toLowerCase()
            const key = `${method}:${path}`

            if (!groupedByPath.has(key)) {
                groupedByPath.set(key, {
                    method,
                    path,
                    requests: [],
                    queryParams: new Map(),
                    pathParams: detectPathParams(path),
                    requestBodies: [],
                    responseBodies: {}
                })
            }

            const group = groupedByPath.get(key)!
            group.requests.push(req)

            // 解析查询参数
            const qParams = parseQueryParams(url)
            qParams.forEach((value, key) => {
                if (!group.queryParams.has(key)) {
                    group.queryParams.set(key, new Set())
                }
                group.queryParams.get(key)!.add(value)
            })

            // 收集请求体
            if (req.request_body) {
                try {
                    const body = JSON.parse(req.request_body)
                    group.requestBodies.push(body)
                } catch {}
            }

            // 收集响应体
            const status = String(req.response_status)
            if (!group.responseBodies[status]) {
                group.responseBodies[status] = []
            }
            if (req.response_body) {
                try {
                    const resp = JSON.parse(req.response_body)
                    group.responseBodies[status].push(resp)
                } catch {}
            }
        } catch (e) {
            console.warn('处理记录失败:', req.url, e)
        }
    }

    // 构建 OpenAPI 规范
    const spec: any = {
        openapi: '3.0.3',
        info: {
            title: 'API Documentation',
            version: '1.0.0',
            description: `自动生成于 ${new Date().toLocaleString()}，基于 ${records.length} 条成功请求记录。`
        },
        servers: Array.from(servers).map(url => ({ url })),
        paths: {},
        components: {
            schemas: {}
        }
    }

    const schemaDefinitions: Map<string, any> = new Map()

    // 处理每个路径
    for (const [key, group] of groupedByPath) {
        const pathItem: any = {}
        const operation: any = {
            summary: `${group.method.toUpperCase()} ${group.path}`,
            operationId: `${group.method}_${group.path.replace(/[^a-zA-Z0-9]/g, '_')}`,
            parameters: [],
            responses: {}
        }

        // 路径参数
        for (const param of group.pathParams) {
            operation.parameters.push({
                name: param,
                in: 'path',
                required: true,
                schema: { type: 'string' }
            })
        }

        // 查询参数
        for (const [param, values] of group.queryParams) {
            operation.parameters.push({
                name: param,
                in: 'query',
                required: false,
                schema: { type: 'string' },
                example: values.values().next().value
            })
        }

        // 请求体（仅 POST/PUT/PATCH）
        if (['post', 'put', 'patch'].includes(group.method) && group.requestBodies.length > 0) {
            const schema = inferSchema(group.requestBodies)
            const schemaName = `${group.method}${group.path.replace(/\//g, '_')}Request`
            schemaDefinitions.set(schemaName, schema)
            operation.requestBody = {
                content: {
                    'application/json': {
                        schema: { $ref: `#/components/schemas/${schemaName}` }
                    }
                }
            }
        }

        // 响应
        for (const [status, bodies] of Object.entries(group.responseBodies)) {
            if (bodies.length === 0) continue
            const schema = inferSchema(bodies)
            const schemaName = `${group.method}${group.path.replace(/\//g, '_')}Response${status}`
            schemaDefinitions.set(schemaName, schema)
            operation.responses[status] = {
                description: `响应 ${status}`,
                content: {
                    'application/json': {
                        schema: { $ref: `#/components/schemas/${schemaName}` }
                    }
                }
            }
        }

        // 至少添加 200 响应占位
        if (Object.keys(operation.responses).length === 0) {
            operation.responses['200'] = { description: '成功' }
        }

        pathItem[group.method] = operation
        spec.paths[group.path] = { ...spec.paths[group.path], ...pathItem }
    }

    // 将 schemas 加入 components
    for (const [name, schema] of schemaDefinitions) {
        spec.components.schemas[name] = schema
    }

    return spec
}