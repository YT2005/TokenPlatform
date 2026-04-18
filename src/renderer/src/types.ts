// src/renderer/src/env.d.ts
import {ipcRenderer} from "electron";
import {DiagnosisContext, DiagnosisResult} from "../../main/services/llm-adapter";

interface IpcRequest {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
    timeout?: number
}

interface IpcResponse {
    status: number
    statusText: string
    headers: Record<string, string>
    body: string
    time: number
    traceId?: string
    error?: string
}

interface UserInfo {
    id: number
    name: string
    role: string
}

interface LogEntry {
    timestamp: string
    line: string
    level?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
}
declare global {
    interface Window {
        api: {
            sendRequest: (params: IpcRequest) => Promise<IpcResponse>
            login: () => Promise<UserInfo>
            logout: () => Promise<void>
            getCurrentUser: () => Promise<UserInfo | null>
            saveToken: (domain: string, token: string) => Promise<void>
            getTokenDomains: () => Promise<string[]>
            deleteToken: (domain: string) => Promise<void>
            fetchLogs: (traceId: string) => Promise<LogEntry[]>
            diagnose: (context: DiagnosisContext) => Promise<{ success: boolean; result?: DiagnosisResult; error?: string ;errorType?: string}>
            saveLLMConfig: (config: { provider: string; apiKey?: string }) => Promise<void>
            getLLMConfig: () => Promise<{ provider: string; hasApiKey: boolean }>
        }
    }
}