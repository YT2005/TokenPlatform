// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron'
import {DiagnosisContext} from "../main/services/llm-adapter";

// 定义请求参数类型（供渲染进程使用）
export interface IpcRequest {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
    timeout?: number
}

export interface IpcResponse {
    status: number
    statusText: string
    headers: Record<string, string>
    body: string
    time: number          // 耗时 ms
    traceId?: string      // 预留 TraceID
}

export interface UserInfo {
    id: number
    name: string
    role: string
}

contextBridge.exposeInMainWorld('api', {
    // 发送 HTTP 请求
    sendRequest: (params: IpcRequest) : Promise<IpcResponse> =>
        ipcRenderer.invoke('http:request', params),
    // 认证相关
    login: () : Promise<UserInfo> =>
        ipcRenderer.invoke('auth:login'),
    logout: () : Promise<void> =>
        ipcRenderer.invoke('auth:logout'),
    getCurrentUser: () : Promise<UserInfo | null> =>
        ipcRenderer.invoke('auth:getCurrentUser'),
    saveToken: (domain: string, token: string) =>
        ipcRenderer.invoke('vault:saveToken', domain, token),
    getTokenDomains: ()=>
        ipcRenderer.invoke('vault:getDomains'),
    deleteToken: (domain : string) =>
        ipcRenderer.invoke('vault:deleteToken', domain),
    fetchLogs: (traceId: string) => ipcRenderer.invoke('logs:fetchByTraceId', traceId),
    diagnose: (context: any) => ipcRenderer.invoke('ai:diagnose', context),
    saveLLMConfig: (config: any) => ipcRenderer.invoke('settings:saveLLMConfig', config),
    getLLMConfig: () => ipcRenderer.invoke('settings:getLLMConfig')
})