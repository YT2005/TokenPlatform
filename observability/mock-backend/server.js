const express = require('express')
const morgan = require('morgan')

const app = express()
app.use(express.json())

// 自定义 morgan token：从请求头中提取 TraceID
morgan.token('trace-id', (req) => req.headers['x-trace-id'] || 'no-trace-id')

// 日志格式：包含 TraceID
const logFormat = ':remote-addr - :method :url :status - :response-time ms - trace-id=:trace-id'
app.use(morgan(logFormat))

// 测试接口：模拟获取用户信息
app.get('/api/users/:id', (req, res) => {
    const userId = req.params.id
    const traceId = req.headers['x-trace-id'] || 'unknown'

    console.log(`[INFO] 查询用户 ID: ${userId}, trace-id=${traceId}`)

    // 模拟业务逻辑
    if (userId === '999') {
        console.warn(`[WARN] 用户不存在: ${userId}, trace-id=${traceId}`)
        return res.status(404).json({ error: 'User not found' })
    }

    // 模拟数据库查询延迟
    setTimeout(() => {
        console.log(`[DEBUG] 从缓存返回用户数据, trace-id=${traceId}`)
        res.json({
            id: userId,
            name: `User ${userId}`,
            email: `user${userId}@example.com`,
            _traceId: traceId   // 方便前端验证
        })
    }, 50)
})

// 测试接口：模拟创建订单
app.post('/api/orders', (req, res) => {
    const traceId = req.headers['x-trace-id'] || 'unknown'
    console.log(`[INFO] 创建订单, body: ${JSON.stringify(req.body)}, trace-id=${traceId}`)

    if (!req.body.productId) {
        console.error(`[ERROR] 缺少 productId 字段, trace-id=${traceId}`)
        return res.status(400).json({ error: 'Missing productId' })
    }

    res.status(201).json({
        orderId: Math.floor(Math.random() * 10000),
        ...req.body,
        _traceId: traceId
    })
})

// 健康检查
app.get('/health', (req, res) => res.send('OK'))

app.listen(8080, () => {
    console.log('Mock Backend running on port 8080')
})