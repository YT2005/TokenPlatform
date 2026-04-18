import Database  from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import crypto from 'crypto'

interface RequestRecord {
    traceId: string
    url: string
    method: string
    requestHeaders: Record<string, string>
    requestBody?: string
    responseStatus: number
    responseHeaders: Record<string, string>
    responseBody: string
    responseTime: number
    createdAt: number
}

class EncryptedDB {
    private db: Database .Database | null = null
    private readonly encryptionKey: Buffer

    constructor() {
        // 使用固定密钥派生（生产环境应从用户主密码派生）
        this.encryptionKey = crypto.createHash('sha256').update('dev-secret-key').digest()
    }

    init(): void {
        const dbPath = path.join(app.getPath('userData'), 'api-client.db')
        this.db = new Database(dbPath)
        // 启用 WAL 模式，大幅减少锁冲突
        this.db.pragma('journal_mode = WAL')
        // 设置同步模式为 NORMAL，平衡安全与性能
        this.db.pragma('synchronous = NORMAL')
        // 创建表
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL UNIQUE,
            encrypted_data TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s','now'))
          );

          CREATE TABLE IF NOT EXISTS requests (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             trace_id TEXT UNIQUE,
             url TEXT NOT NULL,
             method TEXT NOT NULL,
             request_headers TEXT,
             request_body TEXT,
             response_status INTEGER,
             response_headers TEXT,
             response_body TEXT,
             response_time INTEGER,
             created_at INTEGER DEFAULT (strftime('%s','now'))
          );

          CREATE TABLE IF NOT EXISTS settings (
             key TEXT PRIMARY KEY,
             value TEXT NOT NULL,
             encrypted INTEGER DEFAULT 0,
             updated_at INTEGER DEFAULT (strftime('%s','now'))
              );
        `)

        console.log('[EncryptedDB] 数据库初始化成功')

    }

    private encrypt(plaintext: string): string {
        const iv = crypto.randomBytes(12)
        const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv)
        const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
        const authTag = cipher.getAuthTag()
        return Buffer.concat([iv, authTag, encrypted]).toString('base64')
    }

    private decrypt(encryptedData: string): string | null {
        try {
            const buffer = Buffer.from(encryptedData, 'base64')
            const iv = buffer.subarray(0, 12)
            const authTag = buffer.subarray(12, 28)
            const encrypted = buffer.subarray(28)

            const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv)
            decipher.setAuthTag(authTag)
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
            return decrypted.toString('utf8')
        } catch (e) {
            console.error('[EncryptedDB] 解密失败:', e)
            return null
        }
    }

    saveToken(domain: string, plaintext: string): void {
        if (!this.db) throw new Error('数据库未初始化')
        const encrypted = this.encrypt(plaintext)
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tokens (domain, encrypted_data) VALUES (?, ?)
    `)
        stmt.run(domain, encrypted)

    }

    getToken(domain: string): string | null {
        if (!this.db) throw new Error('数据库未初始化')
        const stmt = this.db.prepare(`SELECT encrypted_data FROM tokens WHERE domain = ?`)
        const row = stmt.get(domain) as { encrypted_data: string } | undefined
        if (!row) return null

        return this.decrypt(row.encrypted_data)
    }

    getAllDomains(): string[] {
        if (!this.db) throw new Error('数据库未初始化')

        const stmt = this.db.prepare(`SELECT domain FROM tokens`)
        const rows = stmt.all() as { domain: string }[]
        return rows.map(r => r.domain)
    }

    deleteToken(domain: string): void {
        if (!this.db) throw new Error('数据库未初始化')

        const stmt = this.db.prepare(`DELETE FROM tokens WHERE domain = ?`)
        stmt.run(domain)

    }

    saveRequestRecord(record: RequestRecord): void {
        if (!this.db) throw new Error('数据库未初始化');
        const stmt =this.db.prepare(`
            INSERT INTO requests 
            (trace_id, url, method, request_headers, request_body, response_status, response_headers, response_body, response_time, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        stmt.run(
            record.traceId,
            record.url,
            record.method,
            JSON.stringify(record.requestHeaders),
            record.requestBody || null,
            record.responseStatus,
            JSON.stringify(record.responseHeaders),
            record.responseBody,
            record.responseTime,
            record.createdAt
        );
    }
    getRequestHistory(limit: number = 50): any[] {
        if (!this.db) throw new Error('数据库未初始化')

        const stmt = this.db.prepare(`
            SELECT * FROM requests ORDER BY created_at DESC LIMIT ?
        `)
        return stmt.all(limit)
    }

    // 保存设置（可选择加密）
    saveSetting(key: string, value: string, shouldEncrypt: boolean = false): void {
        if (!this.db) throw new Error('数据库未初始化')
        const finalValue = shouldEncrypt ? this.encrypt(value) : value
        const stmt = this.db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES (?, ?, ?)
  `)
        stmt.run(key, finalValue, shouldEncrypt ? 1 : 0)
    }

    // 获取设置（自动解密）
    getSetting(key: string): string | null {
        if (!this.db) throw new Error('数据库未初始化')
        const stmt = this.db.prepare(`SELECT value, encrypted FROM settings WHERE key = ?`)
        const row = stmt.get(key) as { value: string; encrypted: number } | undefined
        if (!row) return null
        return row.encrypted ? this.decrypt(row.value) : row.value
    }


    close(): void {
        if (this.db) {
            this.db.close()
            this.db = null
        }
    }
}

export const encryptedDB = new EncryptedDB()