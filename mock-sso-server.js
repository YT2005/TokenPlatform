import express, {json, urlencoded} from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(json())
app.use(urlencoded({ extended: true }))

// 模拟用户数据库
const users = {
    'dev': { id: 1, name: 'Developer', role: 'developer' },
    'test': { id: 2, name: 'Tester', role: 'qa' },
    'admin': { id: 3, name: 'Administrator', role: 'admin' }
}

app.get('/', (req, res) => {
    res.redirect('/authorize')
})

// 授权页面 (简单 HTML)
app.get('/authorize', (req, res) => {
    const { redirect_uri = 'myapp://callback', state = '' } = req.query
    res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Mock SSO Login</title></head>
    <body style="font-family: sans-serif; padding: 40px;">
      <h2>模拟统一认证</h2>
      <form method="POST" action="/login?redirect_uri=${encodeURIComponent(redirect_uri)}&state=${encodeURIComponent(state)}">
        <select name="username" style="padding: 8px; width: 200px;">
          <option value="dev">开发人员 (Developer)</option>
          <option value="test">测试人员 (QA)</option>
          <option value="admin">管理员 (Admin)</option>
        </select>
        <br/><br/>
        <button type="submit" style="padding: 10px 20px;">登录</button>
      </form>
    </body>
    </html>
  `)
})

// 处理登录并重定向回客户端
app.post('/login', (req, res) => {
    const { username } = req.body
    const user = users[username]
    if (!user) return res.status(400).send('Invalid user')

    const redirectUri = req.query.redirect_uri || 'myapp://callback'
    const state = req.query.state || ''
    const code = Buffer.from(JSON.stringify(user)).toString('base64')

    res.redirect(`${redirectUri}?code=${code}&state=${state}`)
})

// Token 端点
app.post('/token', (req, res) => {
    const { code } = req.body
    try {
        const user = JSON.parse(Buffer.from(code, 'base64').toString())
        res.json({
            access_token: `mock_access_token_${user.id}`,
            refresh_token: `mock_refresh_token_${user.id}`,
            expires_in: 3600,
            user: user
        })
    } catch {
        res.status(400).json({ error: 'invalid_code' })
    }
})



app.listen(3000, () => {
    console.log('Mock SSO Server running on http://localhost:3000')
})