// 变量替换工具：将字符串中的 {{var}} 替换为对应值
export function replaceVariables(text: string, variables: Record<string, string>): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const trimmed = varName.trim()
        return variables.hasOwnProperty(trimmed) ? variables[trimmed] : match
    })
}

// 递归替换对象中所有字符串值
export function replaceVariablesInObject(obj: any, variables: Record<string, string>): any {
    if (typeof obj === 'string') {
        return replaceVariables(obj, variables)
    }
    if (Array.isArray(obj)) {
        return obj.map(item => replaceVariablesInObject(item, variables))
    }
    if (obj && typeof obj === 'object') {
        const result: any = {}
        for (const [key, value] of Object.entries(obj)) {
            result[key] = replaceVariablesInObject(value, variables)
        }
        return result
    }
    return obj
}