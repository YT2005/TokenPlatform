import { BrowserWindow, ipcMain } from 'electron'
import { encryptedDB } from '../database/encrypted-db'

interface UserInfo {
    id: number
    name: string
    role: string
}

let currentUser: UserInfo | null = null

export function registerSSOHandlers() {
    // 触发登录流程
    ipcMain.handle('auth:login', async () => {
        return new Promise<UserInfo>((resolve, reject) => {
            const authWindow = new BrowserWindow({
                width: 600,
                height: 500,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            })

            const authUrl = `http://localhost:3000/authorize?redirect_uri=${encodeURIComponent('myapp://callback')}&state=${Date.now()}`

            // 监听重定向
            authWindow.webContents.on('will-redirect', async (event, url) => {
                const parsed = new URL(url)
                if (parsed.protocol === 'myapp:') {
                    event.preventDefault()
                    const code = parsed.searchParams.get('code')
                    if (code) {
                        try {
                            // 用 code 交换 token
                            const response = await fetch('http://localhost:3000/token', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ code })
                            })
                            // 在登陆成功时保存用户信息到加密数据库
                            const data = await response.json()
                            currentUser = data.user
                            encryptedDB.saveToken('system:current_user', JSON.stringify(currentUser))

                            authWindow.close()
                            resolve(currentUser)
                        } catch (err) {
                            reject(err)
                        }
                    } else {
                        reject(new Error('授权失败'))
                    }
                }
            })

            authWindow.loadURL(authUrl)
            authWindow.on('closed', () => reject(new Error('登录窗口被关闭')))
        })
    })

    // 获取当前用户
    ipcMain.handle('auth:getCurrentUser', async () => {
        if (!currentUser) {
            const saved = encryptedDB.getToken('system:current_user')
            if (saved) {
                currentUser = JSON.parse(saved)
            }
        }
        return currentUser
    })

    // 登出时清除
    ipcMain.handle('auth:logout', async () => {
        currentUser = null
        encryptedDB.saveToken('system:current_user', '')
    })
}