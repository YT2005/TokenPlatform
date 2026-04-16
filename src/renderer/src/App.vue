<template>
  <div class="app-container">
    <!-- 顶部状态栏 -->
    <div class="top-bar">
      <div v-if="currentUser" class="user-info">
        <el-avatar :size="28">{{ currentUser.name.charAt(0) }}</el-avatar>
        <el-dropdown @command="handleUserCommand">
          <span class="user-name">{{ currentUser.name }} ({{ currentUser.role }})</span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="switch">切换身份</el-dropdown-item>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <el-button v-else @click="login">登录</el-button>
    </div>
    <!-- 左侧边栏：应用/环境/历史 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <el-input placeholder="搜索接口..." prefix-icon="Search" size="small" />
      </div>
      <el-tree
          :data="treeData"
          :props="{ label: 'name', children: 'children' }"
          node-key="id"
          default-expand-all
          highlight-current
          @node-click="handleNodeClick"
      />
      <div class="sidebar-footer">
        <el-button type="primary" link>+ 新建请求</el-button>
      </div>
    </aside>

    <!-- 中间请求编辑区 -->
    <main class="request-panel">
      <!-- 地址栏 -->
      <div class="url-bar">
        <el-select v-model="method" placeholder="方法" style="width: 100px">
          <el-option label="GET" value="GET" />
          <el-option label="POST" value="POST" />
          <el-option label="PUT" value="PUT" />
          <el-option label="DELETE" value="DELETE" />
          <el-option label="PATCH" value="PATCH" />
        </el-select>
        <el-input v-model="url" placeholder="输入请求 URL" class="url-input">
          <template #append>
            <el-button type="primary" @click="sendRequest">发送</el-button>
          </template>
        </el-input>
      </div>

      <!-- 请求配置标签页 -->
      <el-tabs v-model="activeTab" class="request-tabs">
        <el-tab-pane label="Params" name="params">
          <ParamsTable v-model="queryParams" />
        </el-tab-pane>
        <el-tab-pane label="Headers" name="headers">
          <KeyValueTable v-model="headers" />
        </el-tab-pane>
        <el-tab-pane label="Body" name="body">
          <BodyEditor v-model="body" :content-type="bodyType" @update:content-type="bodyType = $event" />
        </el-tab-pane>
        <el-tab-pane label="Auth" name="auth">
          <AuthPanel />
        </el-tab-pane>
      </el-tabs>
    </main>

    <!-- 右侧响应区 -->
    <aside class="response-panel">
      <div class="response-header">
        <span>响应</span>
        <el-tag v-if="statusCode" :type="statusType">{{ statusCode }}</el-tag>
        <span v-if="responseTime">{{ responseTime }}ms</span>
      </div>
      <el-tabs v-model="responseTab" class="response-tabs">
        <el-tab-pane label="Body" name="body">
          <el-input
              v-model="responseBody"
              type="textarea"
              :rows="20"
              readonly
              placeholder="响应内容将显示在这里"
          />
        </el-tab-pane>
        <el-tab-pane label="Headers" name="respHeaders">
          <KeyValueTable v-model="responseHeaders" :readonly="true" />
        </el-tab-pane>
        <el-tab-pane label="日志" name="logs">
          <div class="logs-placeholder">（后续关联 TraceID 日志）</div>
        </el-tab-pane>
      </el-tabs>
    </aside>
  </div>
</template>

<script setup lang="ts">

import { ref, computed, onMounted } from 'vue'

import ParamsTable from './components/ParamsTable.vue'
import KeyValueTable from './components/KeyValueTable.vue'
import BodyEditor from './components/BodyEditor.vue'
import AuthPanel from './components/AuthPanel.vue'
import {ElMessage} from "element-plus";



// 左侧树数据（模拟）
const treeData = ref([
  {
    id: 1,
    name: '用户服务',
    children: [
      { id: 11, name: 'GET /users' },
      { id: 12, name: 'POST /users' },
    ]
  },
  {
    id: 2,
    name: '订单服务',
    children: [
      { id: 21, name: 'GET /orders' },
    ]
  }
])

// 请求相关状态
const method = ref('GET')
const url = ref('https://jsonplaceholder.typicode.com/posts/1')
const activeTab = ref('params')
const queryParams = ref<Array<{ key: string; value: string }>>([])
const headers = ref<Array<{ key: string; value: string }>>([
  { key: 'Content-Type', value: 'application/json' }
])
const body = ref('')
const bodyType = ref('JSON')

// 响应相关状态
const responseTab = ref('body')
const statusCode = ref<number | null>(null)
const responseTime = ref<number | null>(null)
const responseBody = ref('')
const responseHeaders = ref<Array<{ key: string; value: string }>>([])
const currentUser = ref<any>(null)

const statusType = computed(() => {
  if (!statusCode.value) return ''
  return statusCode.value >= 200 && statusCode.value < 300 ? 'success' : 'danger'
})
onMounted(async () => {
  console.log('window.api:', window.api)
  currentUser.value = await window.api.getCurrentUser()
})

// 事件处理
const handleNodeClick = (data: any) => {
  // 模拟点击后填充请求信息
  if (data.name.startsWith('GET')) {
    method.value = 'GET'
    url.value = 'https://jsonplaceholder.typicode.com' + data.name.replace('GET ', '')
  }
}

const sendRequest = async () => {
  // 重置响应显示
  statusCode.value = null
  responseTime.value = null
  responseBody.value = '加载中...'
  responseHeaders.value = []

  try {
    // 1. 构建完整 URL（含查询参数）
    let fullUrl = url.value
    const queryString = queryParams.value
        .filter(p => p.key)
        .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
        .join('&')
    if (queryString) {
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString
    }

    // 2. 构建请求头
    const requestHeaders: Record<string, string> = {}
    headers.value.filter(h => h.key).forEach(h => {
      requestHeaders[h.key] = h.value
    })

    // 3. 准备请求体（根据 Body 类型处理，当前简化为直接使用 body 字符串）
    const requestBody = body.value

    //4. 调用主进程代理
    const response = await window.api.sendRequest({
      url: fullUrl,
      method: method.value,
      headers: requestHeaders,
      body: requestBody,
    })

    //5. 更新 UI
    statusCode.value = response.status
    responseTime.value = response.time
    responseBody.value = response.body
    // 将响应头转换为键值对数组便于表格展示
    responseHeaders.value = Object.entries(response.headers).map(([key, value]) => ({
      key,
      value: value as string
    }))

    // 可选：显示 TraceID（后续可扩展）
    console.log('TraceID:', response.traceId)

  } catch (error: any) {
    statusCode.value = 0
    responseBody.value = `请求出错: ${error.message}`
  }
}
const login = async () => {
  try {
    currentUser.value = await window.api.login()
    ElMessage.success('登录成功')
  } catch (e: any) {
    console.error('登录错误:', e)
    ElMessage.error(`登录失败: ${e.message || '未知错误'}`)
  }
}
const handleUserCommand = async (cmd: string) => {
  if (cmd === 'logout') {
    await window.api.logout()
    currentUser.value = null
    ElMessage.info('已退出')
  } else if (cmd === 'switch') {
    await window.api.logout()
    currentUser.value = await window.api.login()
  }
}
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: #f5f7fa;
}

.sidebar {
  width: 260px;
  background-color: white;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  padding: 12px 0;
}

.sidebar-header {
  padding: 0 12px 12px;
}

.sidebar-footer {
  margin-top: auto;
  padding: 12px;
  border-top: 1px solid #e4e7ed;
}

.request-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  min-width: 0;
}

.url-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.url-input {
  flex: 1;
}

.request-tabs {
  flex: 1;
  background-color: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.response-panel {
  width: 420px;
  background-color: white;
  border-left: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.response-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  font-weight: 500;
}

.response-tabs {
  flex: 1;
}

.logs-placeholder {
  color: #909399;
  text-align: center;
  padding: 40px 0;
}
</style>