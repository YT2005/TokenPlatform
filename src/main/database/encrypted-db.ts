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
            sync_status INTEGER DEFAULT 0,   -- 0: 未同步, 1: 已同步 
            created_at INTEGER DEFAULT (strftime('%s','now'))
          );

          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            encrypted INTEGER DEFAULT 0,
            updated_at INTEGER DEFAULT (strftime('%s','now'))
          );
          CREATE TABLE IF NOT EXISTS environments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            is_default INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s','now')),
            updated_at INTEGER DEFAULT (strftime('%s','now'))
          );

          CREATE TABLE IF NOT EXISTS env_variables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            env_id INTEGER NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            encrypted INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s','now')),
            FOREIGN KEY (env_id) REFERENCES environments(id) ON DELETE CASCADE,
            UNIQUE(env_id, key)
          );
        `)
        // 字段迁移：确保旧表有 sync_status 列
        try {
            const tableInfo = this.db.prepare(`PRAGMA table_info(requests)`).all() as any[]
            if (!tableInfo.some(col => col.name === 'sync_status')) {
                this.db.exec(`ALTER TABLE requests ADD COLUMN sync_status INTEGER DEFAULT 0`)
            }
        } catch (e) {
            // 忽略迁移错误
        }
        // 初始化默认环境（如果表为空）
        const envCount = this.db.prepare(`SELECT COUNT(*) as cnt FROM environments`).get() as { cnt: number }
        if (envCount.cnt === 0) {
            this.db.prepare(`INSERT INTO environments (name, description, is_default) VALUES (?, ?, ?)`)
                .run('开发环境', '本地开发环境', 1)
            const devEnvId = this.db.prepare(`SELECT last_insert_rowid() as id`).get() as { id: number }
            // 添加默认变量示例
            this.db.prepare(`INSERT INTO env_variables (env_id, key, value, encrypted) VALUES (?, ?, ?, ?)`)
                .run(devEnvId.id, 'baseUrl', 'http://localhost:8080', 0)
            this.db.prepare(`INSERT INTO env_variables (env_id, key, value, encrypted) VALUES (?, ?, ?, ?)`)
                .run(devEnvId.id, 'apiKey', 'dev-api-key-123', 1) // 加密存储
        }

        console.log('[EncryptedDB] Database initialization successful')

    }

    // ========== 环境管理 ==========
    getAllEnvironments(): any[] {
        const stmt = this.db!.prepare(`SELECT * FROM environments ORDER BY is_default DESC, name ASC`)
        return stmt.all()
    }

    getEnvironmentById(id: number): any {
        return this.db!.prepare(`SELECT * FROM environments WHERE id = ?`).get(id)
    }

    createEnvironment(name: string, description?: string): number {
        const stmt = this.db!.prepare(`INSERT INTO environments (name, description) VALUES (?, ?)`)
        const info = stmt.run(name, description || null)
        return info.lastInsertRowid as number
    }

    updateEnvironment(id: number, name: string, description?: string): void {
        this.db!.prepare(`UPDATE environments SET name = ?, description = ?, updated_at = strftime('%s','now') WHERE id = ?`)
            .run(name, description || null, id)
    }

    deleteEnvironment(id: number): void {
        // 外键级联会自动删除关联变量
        this.db!.prepare(`DELETE FROM environments WHERE id = ?`).run(id)
    }

    setDefaultEnvironment(id: number): void {
        this.db!.exec('BEGIN')
        this.db!.prepare(`UPDATE environments SET is_default = 0`).run()
        this.db!.prepare(`UPDATE environments SET is_default = 1 WHERE id = ?`).run(id)
        this.db!.exec('COMMIT')
    }

    getVariablesForEnvironment(envId: number): any[] {
        return this.db!.prepare(`SELECT * FROM env_variables WHERE env_id = ? ORDER BY key`).all(envId)
    }

    saveVariable(envId: number, key: string, value: string, shouldEncrypt: boolean = false): void {
        const finalValue = shouldEncrypt ? this.encrypt(value) : value
        this.db!.prepare(`
    INSERT INTO env_variables (env_id, key, value, encrypted) VALUES (?, ?, ?, ?)
    ON CONFLICT(env_id, key) DO UPDATE SET value = excluded.value, encrypted = excluded.encrypted
  `).run(envId, key, finalValue, shouldEncrypt ? 1 : 0)
    }

    deleteVariable(envId: number, key: string): void {
        this.db!.prepare(`DELETE FROM env_variables WHERE env_id = ? AND key = ?`).run(envId, key)
    }

    // 获取当前激活环境的变量（用于请求替换）
    getActiveEnvironmentVariables(): Record<string, string> {
        const env = this.db!.prepare(`SELECT id FROM environments WHERE is_default = 1`).get() as { id: number } | undefined
        if (!env) return {}

        const vars = this.db!.prepare(`SELECT key, value, encrypted FROM env_variables WHERE env_id = ?`).all(env.id) as any[]
        const result: Record<string, string> = {}
        for (const v of vars) {
            result[v.key] = v.encrypted ? (this.decrypt(v.value) || '') : v.value
        }
        return result
    }

    // ========== 加密相关 ==========
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
    // ========== Token 管理 ==========
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

    // ========== 请求记录 ==========
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

    getRequestHistory(limit?: number): any[] {
        if (!this.db) throw new Error('数据库未初始化')

        const stmt = this.db.prepare(`
            SELECT * FROM requests ORDER BY created_at DESC LIMIT ?
        `)
        return stmt.all(limit)
    }
    getRequestById(id: number): any {
        if (!this.db) throw new Error('数据库未初始化')

        const stmt = this.db!.prepare(`SELECT * FROM requests WHERE id = ?`)
        return stmt.get(id)
    }
    deleteRequestRecords(ids: number[]): void {
        if (!this.db || ids.length === 0) return
        const placeholders = ids.map(() => '?').join(',')
        this.db.prepare(`DELETE FROM requests WHERE id IN (${placeholders})`).run(...ids)
    }

    // ========== 同步相关 ==========
    getUnsyncedRequests(limit?: number): any[] {
        if (!this.db) throw new Error('数据库未初始化')
        const stmt = this.db.prepare(`
            SELECT * FROM requests WHERE sync_status = 0 ORDER BY created_at ASC LIMIT ?
        `)
        return stmt.all(limit)
    }
    // 标记记录为已同步
    markAsSynced(ids: number[]): void {
        if (!this.db || ids.length === 0) return
        const placeholders = ids.map(() => '?').join(',')
        const stmt = this.db.prepare(`
    UPDATE requests SET sync_status = 1 WHERE id IN (${placeholders})
  `)
        stmt.run(...ids)
    }
    getUnsyncedCount(): number {
        if (!this.db) return 0
        const row = this.db.prepare(`SELECT COUNT(*) as cnt FROM requests WHERE sync_status = 0`).get() as { cnt: number }
        return row.cnt
    }

    // ========== 设置管理 ==========
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