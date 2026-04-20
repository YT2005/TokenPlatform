// mock-cloud-server.js
const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const DATA_FILE = path.join(__dirname, 'cloud-data.json')

// 初始化数据文件
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ requests: [] }, null, 2))
}

// 健康检查
app.get('/health', (req, res) => res.send('OK'))

// 获取所有已同步记录
app.get('/api/sync/requests', (req, res) => {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
    res.json(data.requests)
})

// 接收批量上传
app.post('/api/sync/upload', (req, res) => {
    const { requests } = req.body
    if (!Array.isArray(requests)) {
        return res.status(400).json({ error: 'Invalid format, expected array' })
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
    const existingIds = new Set(data.requests.map(r => r.trace_id))
    const newRequests = requests.filter(r => !existingIds.has(r.trace_id))

    data.requests.push(...newRequests)
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))

    console.log(`[Cloud] 收到 ${requests.length} 条，新增 ${newRequests.length} 条`)
    res.json({ received: requests.length, added: newRequests.length })
})

app.listen(3002, () => {
    console.log('Mock Cloud Server running on http://localhost:3002')
})