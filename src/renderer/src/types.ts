// src/renderer/src/env.d.ts
import {ipcRenderer} from "electron";

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
        }
    }
}