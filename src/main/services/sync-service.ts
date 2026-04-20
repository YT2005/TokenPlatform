// src/main/services/sync-service.ts
import { ipcMain, BrowserWindow } from 'electron'
import axios from 'axios'
import { encryptedDB } from '../database/encrypted-db'

const CLOUD_URL = 'http://localhost:3002'
const SYNC_INTERVAL = 30000 // 30秒

let syncTimer: NodeJS.Timeout | null = null
let isOnline = true

export function initSyncService() {
    // 监听网络状态变化
    const handleOnline = () => {
        isOnline = true
        console.log('[Sync] 网络已连接，开始同步')
        syncUnsyncedRecords()
    }
    const handleOffline = () => {
        isOnline = false
        console.log('[Sync] 网络已断开')
    }

    // 从已有窗口获取 webContents 监听
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
        win.webContents.on('online', handleOnline)
        win.webContents.on('offline', handleOffline)
    }

    // 定时同步
    syncTimer = setInterval(() => {
        if (isOnline) {
            syncUnsyncedRecords()
        }
    }, SYNC_INTERVAL)

    // 启动后延迟 3 秒首次同步
    setTimeout(() => {
        if (isOnline) syncUnsyncedRecords()
    }, 3000)

    console.log('[Sync] 同步服务已启动')
}

export function stopSyncService() {
    if (syncTimer) clearInterval(syncTimer)
    syncTimer = null
}

async function syncUnsyncedRecords() {
    try {
        const unsynced = encryptedDB.getUnsyncedRequests(20)
        if (unsynced.length === 0) {
            return
        }

        console.log(`[Sync] 正在上传 ${unsynced.length} 条记录`)

        const cloudRecords = unsynced.map(r => ({
            trace_id: r.trace_id,
            url: r.url,
            method: r.method,
            request_headers: r.request_headers,
            request_body: r.request_body,
            response_status: r.response_status,
            response_headers: r.response_headers,
            response_body: r.response_body,
            response_time: r.response_time,
            created_at: r.created_at
        }))

        const response = await axios.post(`${CLOUD_URL}/api/sync/upload`, { requests: cloudRecords }, { timeout: 10000 })

        if (response.status === 200) {
            const ids = unsynced.map(r => r.id)
            encryptedDB.markAsSynced(ids)
            console.log(`[Sync] 同步成功，已标记 ${ids.length} 条`)

            // 通知所有渲染进程更新同步状态
            BrowserWindow.getAllWindows().forEach(w => w.webContents.send('sync:completed'))
        }
    } catch (error: any) {
        console.error('[Sync] 同步失败:', error.message)
    }
}

// ========== 注册 IPC ==========
export function registerSyncHandlers() {
    ipcMain.handle('sync:trigger', async () => {
        await syncUnsyncedRecords()
    })

    ipcMain.handle('sync:getUnsyncedCount', () => {
        return encryptedDB.getUnsyncedCount()
    })

    ipcMain.handle('history:getList', (_, limit: number) => {
        return encryptedDB.getRequestHistory(limit)
    })

    ipcMain.handle('history:getDetail', (_, id: number) => {
        return encryptedDB.getRequestById(id)
    })
    ipcMain.handle('history:deleteRecords', (_, ids: number[]) => {
        encryptedDB.deleteRequestRecords(ids)
    })
}