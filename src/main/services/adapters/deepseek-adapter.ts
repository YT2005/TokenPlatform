import axios from 'axios'
import { LLMAdapter, DiagnosisContext, DiagnosisResult } from '../llm-adapter'

export class DeepSeekAdapter implements LLMAdapter {
    name = 'DeepSeek'

    constructor(private apiKey: string, private baseURL: string = 'https://api.deepseek.com') {}

    async analyzeError(context: DiagnosisContext): Promise<DiagnosisResult> {
        const prompt = this.buildPrompt(context)

        const response = await axios.post(
            `${this.baseURL}/v1/chat/completions`,
            {
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: this.getSystemPrompt() },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 1000
            },
            {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        )

        const content = response.data.choices[0].message.content
        return this.parseResponse(content)
    }

    private getSystemPrompt(): string {
        return `你是一位资深的后端开发工程师和 API 调试专家。
请根据提供的请求、响应信息和后端日志，分析 API 调用失败的原因，并给出明确的修复建议。
输出必须为严格的 JSON 格式，包含以下字段：
- summary: 错误简述（一句话）
- rootCause: 根本原因详细分析
- suggestions: 修复建议列表（字符串数组）
- correctedExample: 修正后的请求示例（如 cURL 命令或 JSON body）`
    }

    private buildPrompt(context: DiagnosisContext): string {
        const { request, response, logs } = context
        return `
## 请求信息
- URL: ${request.url}
- Method: ${request.method}
- Headers: ${JSON.stringify(this.sanitizeHeaders(request.headers))}
- Body: ${request.body || '(无)'}

## 响应信息
- Status: ${response.status} ${response.statusText}
- Headers: ${JSON.stringify(response.headers)}
- Body: ${response.body.substring(0, 2000)} ${response.body.length > 2000 ? '...(截断)' : ''}

## 后端日志
${logs && logs.length > 0 ? logs.join('\n') : '(无日志)'}

请分析错误原因并提供修复方案。`
    }

    private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
        const sensitive = ['authorization', 'cookie', 'x-api-key']
        const sanitized: Record<string, string> = {}
        for (const [k, v] of Object.entries(headers)) {
            sanitized[k] = sensitive.includes(k.toLowerCase()) ? '***REDACTED***' : v
        }
        return sanitized
    }

    private parseResponse(content: string): DiagnosisResult {
        try {
            // 尝试提取 JSON（LLM 可能包裹在 markdown 代码块中）
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/({[\s\S]*})/)
            const jsonStr = jsonMatch ? jsonMatch[1] : content
            return JSON.parse(jsonStr)
        } catch {
            // 降级：直接使用原始内容作为分析
            return {
                summary: 'AI 分析结果',
                rootCause: content,
                suggestions: [],
                correctedExample: undefined
            }
        }
    }
}