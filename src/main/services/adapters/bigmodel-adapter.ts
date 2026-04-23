import axios from 'axios'
import { LLMAdapter, DiagnosisContext, DiagnosisResult } from '../llm-adapter'

export class BigmodelAdapter implements LLMAdapter {
    name = '智谱AI (GLM)'

    constructor(
        private apiKey: string,
        private model: string = 'glm-4-flash', // 默认推荐 glm-4-flash
        private baseURL: string = 'https://open.bigmodel.cn/api/paas/v4' // 国内标准端点[reference:1]
    ) {}

    async analyzeError(context: DiagnosisContext): Promise<DiagnosisResult> {
        const prompt = this.buildPrompt(context)

        try {
            const response = await axios.post(
                `${this.baseURL}/chat/completions`, // 智谱AI的标准聊天补全端点[reference:2]
                {
                    model: this.model,
                    messages: [
                        { role: 'system', content: this.getSystemPrompt() },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.1,
                    max_tokens: 1000
                },
                {
                    headers: {
                        // 智谱AI使用Bearer Token认证[reference:3]
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            )
            const content = response.data.choices[0].message.content
            return this.parseResponse(content)
        }catch (error: any){
            console.error('[LLM Adapter] 请求失败:', error.message)
            let errorMessage = 'AI 服务请求失败'
            let errorType: 'network' | 'auth' | 'invalid_key' | 'unknown' = 'unknown'

            if (error.response) {
                const status = error.response.status
                if (status === 401 || status === 403) {
                    errorMessage = 'API Key 无效或已过期，请检查设置'
                    errorType = 'invalid_key'
                } else {
                    errorMessage = `服务返回错误 (${status})`
                }
            } else if (error.request) {
                errorMessage = '网络连接失败，请检查网络或代理设置'
                errorType = 'network'
            }

            throw { message: errorMessage, type: errorType }  // 抛出结构化错误
        }
    }

    private getSystemPrompt(): string {
        return `你是一位资深的后端开发工程师和 API 调试专家。
请根据提供的请求、响应信息和后端日志，分析 API 调用失败的原因，并给出明确的修复建议。
输出必须为严格的 JSON 格式，包含以下字段：
- summary: 错误简述（一句话）
- rootCause: 根本原因详细分析
- suggestions: 修复建议列表（字符串数组）
- correctedExample: 修正后的请求示例。如果是修改请求体，则直接提供正确的 JSON 对象字符串；如果是修改 URL 或方法，则提供完整的 cURL 命令。确保该字段可被程序直接解析使用。`
    }

    private buildPrompt(context: DiagnosisContext): string {
        const { request, response, logs } = context
        return `
## 请求信息
- URL: ${request.url}
- Method: ${request.method}
- Headers: ${JSON.stringify(request.headers)}
- Body: ${request.body || '(无)'}

## 响应信息
- Status: ${response.status} ${response.statusText}
- Headers: ${JSON.stringify(response.headers)}
- Body: ${response.body.substring(0, 2000)} ${response.body.length > 2000 ? '...(截断)' : ''}

## 后端日志
${logs && logs.length > 0 ? logs.join('\n') : '(无日志)'}

请分析错误原因并提供修复方案。`
    }


    private parseResponse(content: string): DiagnosisResult {
        try {
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/({[\s\S]*})/)
            const jsonStr = jsonMatch ? jsonMatch[1] : content
            return JSON.parse(jsonStr)
        } catch {
            return {
                summary: 'AI 分析结果',
                rootCause: content,
                suggestions: [],
                correctedExample: undefined
            }
        }
    }
}