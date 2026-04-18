import { LLMAdapter, DiagnosisContext, DiagnosisResult } from '../llm-adapter'

export class RuleEngineAdapter implements LLMAdapter {
    name = '规则引擎（离线）'

    async analyzeError(context: DiagnosisContext): Promise<DiagnosisResult> {
        const { response } = context
        const status = response.status

        // 预定义规则
        if (status === 400) {
            return {
                summary: '请求参数错误',
                rootCause: '服务器无法理解当前请求，通常是因为参数格式错误或缺少必填字段。',
                suggestions: [
                    '检查请求 Body 的 JSON 格式是否正确',
                    '确认必填字段是否存在',
                    '核对字段类型是否与 API 文档一致'
                ]
            }
        }
        if (status === 401) {
            return {
                summary: '认证失败',
                rootCause: '请求未包含有效的身份凭证。',
                suggestions: [
                    '检查 Authorization 头是否正确设置',
                    '确认 Token 是否过期，尝试重新获取',
                    '验证 Token 是否有权限访问该资源'
                ]
            }
        }
        if (status === 403) {
            return {
                summary: '权限不足',
                rootCause: '当前身份没有执行该操作的权限。',
                suggestions: [
                    '确认账号角色是否拥有对应权限',
                    '检查是否误用了只读 Token 进行写操作'
                ]
            }
        }
        if (status === 404) {
            return {
                summary: '资源不存在',
                rootCause: '请求的路径或资源 ID 在服务器上未找到。',
                suggestions: [
                    '检查 URL 路径是否正确',
                    '确认资源 ID 是否存在',
                    '查看 API 文档确认正确端点'
                ]
            }
        }
        if (status >= 500) {
            return {
                summary: '服务器内部错误',
                rootCause: '服务器端发生未预期的异常。',
                suggestions: [
                    '查看后端日志获取详细错误堆栈',
                    '联系后端开发人员排查',
                    '检查请求数据是否触发了服务端 bug'
                ]
            }
        }

        return {
            summary: '未知错误',
            rootCause: '无法自动诊断此错误，请查看完整响应信息。',
            suggestions: []
        }
    }
}