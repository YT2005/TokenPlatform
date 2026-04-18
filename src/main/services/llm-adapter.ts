// LLM 诊断上下文
export interface DiagnosisContext {
    request: {
        url: string
        method: string
        headers: Record<string, string>
        body?: string
    }
    response: {
        status: number
        statusText: string
        headers: Record<string, string>
        body: string
        time: number
    }
    logs?: string[]           // 从 Loki 拉取的后端日志
    openApiSpec?: string      // 可选的接口定义
}

// 诊断结果
export interface DiagnosisResult {
    summary: string           // 错误概述
    rootCause: string         // 根本原因分析
    suggestions: string[]     // 修复建议列表
    correctedExample?: string // 修正后的请求示例（如 cURL）
}

// 适配器接口
export interface LLMAdapter {
    name: string
    analyzeError(context: DiagnosisContext): Promise<DiagnosisResult>
}

// 诊断响应接口
export interface DiagnosisResponse {
    success: boolean
    result?: DiagnosisResult
    error?: string
    errorType?: 'network' | 'auth' | 'invalid_key' | 'unknown'
}