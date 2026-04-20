<template>
  <div class="app-container">
    <!-- 左侧边栏-->
    <aside class="sidebar">
      <!-- 用户信息 -->
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

      <!-- 请求历史区域 -->
      <div class="history-section">
        <div class="history-header">
          <span>请求历史</span>
          <div class="history-actions">
            <!-- 同步指示器 -->
            <div class="sync-indicator" @click="triggerManualSync">
              <el-tooltip :content="syncTooltip" placement="bottom">
                <el-badge :value="unsyncedCount" :hidden="unsyncedCount === 0" :max="99">
                  <el-icon :size="20" :class="{ 'syncing': isSyncing }">
                    <Cloudy v-if="!isOnline" />
                    <PartlyCloudy v-else-if="unsyncedCount > 0" />
                    <Sunny v-else />
                  </el-icon>
                </el-badge>
              </el-tooltip>
            </div>
            <el-button link @click="refreshHistory" title="刷新">
              <el-icon><Refresh /></el-icon>
            </el-button>
            <el-button
                v-if="!isBatchDeleteMode"
                link
                @click="enterBatchDeleteMode"
                title="批量删除"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
            <template v-else>
              <el-button link @click="cancelBatchDelete" title="取消">
                <el-icon><Close /></el-icon>
              </el-button>
              <el-button
                  link
                  :disabled="selectedHistoryIds.size === 0"
                  @click="batchDeleteSelected"
                  title="确认删除"
              >
                <el-icon><Check /></el-icon>
              </el-button>
            </template>

          </div>
        </div>
        <!-- 搜索与过滤 -->
        <div class="history-filters">
          <el-input
              v-model="historySearchKeyword"
              placeholder="搜索 URL / 方法 / 状态码"
              size="small"
              clearable
              @input="applyHistoryFilters"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select
              v-model="historyStatusFilter"
              size="small"
              placeholder="状态"
              style="width: 90px; margin-left: 8px"
              @change="applyHistoryFilters"
          >
            <el-option label="全部" value="all" />
            <el-option label="2xx" value="2xx" />
            <el-option label="4xx" value="4xx" />
            <el-option label="5xx" value="5xx" />
          </el-select>
        </div>

        <!-- 历史列表 -->
        <div class="history-list">
          <div
              v-for="item in filteredHistoryList"
              :key="item.id"
              class="history-item"
              :class="{ 'batch-mode': isBatchDeleteMode }"
          >
            <el-checkbox
                v-if="isBatchDeleteMode"
                v-model="item.selected"
                size="small"
                @change="updateSelectedSet(item.id, item.selected)"
                @click.stop
            />
            <div
                class="history-item-main"
                @click="!isBatchDeleteMode && loadHistoryItem(item)"
            >
              <div class="history-method" :class="`method-${item.method.toLowerCase()}`">
                {{ item.method }}
              </div>
              <div class="history-url">{{ truncateUrl(item.url) }}</div>
              <div class="history-status" :class="`status-${Math.floor(item.response_status / 100)}`">
                {{ item.response_status }}
              </div>
              <el-icon v-if="item.sync_status === 1" class="synced-icon"><Check /></el-icon>
              <el-icon v-else class="unsynced-icon"><Clock /></el-icon>
            </div>
            <el-button
                v-if="!isBatchDeleteMode"
                link
                class="delete-single-btn"
                @click.stop="deleteSingleHistory(item.id)"
                title="删除本地记录"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <div v-if="filteredHistoryList.length === 0" class="history-empty">
            暂无历史记录
          </div>
        </div>

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
        <el-tab-pane label="设置" name="settings">
          <Settings />
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
          <div class="logs-container">
            <div class="logs-toolbar">
              <el-button
                  type="primary"
                  size="small"
                  :loading="logsLoading"
                  @click="fetchLogsForCurrentRequest"
                  :disabled="!lastTraceId"
              >
                刷新日志
              </el-button>
              <div v-if="lastTraceId" class="trace-id-container">
                <span class="trace-id-label">TraceID:</span>
                <code class="trace-id-value">{{ formatTraceId(lastTraceId) }}</code>
                <el-button
                    size="small"
                    text
                    @click="copyTraceId"
                    title="复制完整 TraceID"
                >
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
              </div>
              <el-button
                  v-if="lastTraceId"
                  size="small"
                  text
                  @click="openInGrafana"
                  title="在 Grafana 中查看"
              >
                <el-icon><DataAnalysis /></el-icon>
              </el-button>
            </div>
            <div class="logs-list" v-loading="logsLoading">
              <div v-if="logEntries.length === 0" class="logs-empty">
                暂无日志，请先发送请求
              </div>
              <div v-for="(log, index) in logEntries" :key="index" class="log-entry" :class="`log-${log.level?.toLowerCase()}`">
                <span class="log-time">{{ formatTime(log.timestamp) }}</span>
                <span class="log-line">{{ log.line }}</span>
              </div>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="AI 诊断" name="aiDiagnosis">
          <div class="diagnosis-container" v-loading="diagnosing">
            <!-- 错误提示区域 -->
            <el-alert
                v-if="diagnosisError"
                :title="diagnosisError"
                :type="errorAlertType"
                :closable="false"
                show-icon
            >
              <template #default>
                <el-button
                    type="primary"
                    link
                    @click="retryDiagnosis"
                    :loading="diagnosing"
                    style="margin-left: 8px"
                >
                  重试
                </el-button>
              </template>
            </el-alert>
            <!-- 诊断结果展示 -->
            <div v-else-if="diagnosisResult">
              <el-alert :title="diagnosisResult.summary" type="error" :closable="false" />
              <div class="diagnosis-section">
                <h4>根本原因</h4>
                <p>{{ diagnosisResult.rootCause }}</p>
              </div>
              <div class="diagnosis-section" v-if="diagnosisResult.suggestions.length">
                <h4>修复建议</h4>
                <ul>
                  <li v-for="(s, i) in diagnosisResult.suggestions" :key="i">{{ s }}</li>
                </ul>
              </div>
              <div class="diagnosis-section" v-if="diagnosisResult.correctedExample">
                <h4>
                  修正示例
                  <el-button type="success" size="small" @click="applyCorrection" style="margin-left: 12px">
                    一键应用修复
                  </el-button>
                </h4>
                <pre>{{ diagnosisResult.correctedExample }}</pre>
              </div>
            </div>
            <!-- 空状态 -->
            <div v-else-if="!diagnosisResult && !diagnosing" class="diagnosis-placeholder">
              当请求返回 4xx/5xx 状态码时，点击下方按钮进行 AI 诊断
            </div>

            <!-- 操作按钮 -->
            <div class="diagnosis-actions">
              <el-button
                  type="primary"
                  :disabled="!lastErrorResponse"
                  :loading="diagnosing"
                  @click="runDiagnosis"
              >
                {{ diagnosing ? '诊断中...' : '开始诊断' }}
              </el-button>
              <el-button
                  v-if="diagnosisResult || diagnosisError"
                  @click="retryDiagnosis"
              >
                重新诊断
              </el-button>
            </div>
          </div>

        </el-tab-pane>
      </el-tabs>
    </aside>
  </div>
</template>

<script setup lang="ts">

import {ref, computed, onMounted, onUnmounted, watch} from 'vue'

import ParamsTable from './components/ParamsTable.vue'
import KeyValueTable from './components/KeyValueTable.vue'
import BodyEditor from './components/BodyEditor.vue'
import AuthPanel from './components/AuthPanel.vue'
import {ElMessage, ElBadge, ElMessageBox} from "element-plus";
import { CopyDocument, DataAnalysis,  Cloudy, PartlyCloudy, Sunny, Refresh,Check, Clock,Delete, Close, Search  } from '@element-plus/icons-vue'
import Settings from "./components/Settings.vue";
import {DiagnosisContext, DiagnosisResult} from "../../main/services/llm-adapter";
import {IpcResponse} from "../../preload/preload";
import {parseCurl} from "./utils/curl-parser";




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


// 事件处理
const handleNodeClick = (data: any) => {
  // 模拟点击后填充请求信息
  if (data.name.startsWith('GET')) {
    method.value = 'GET'
    url.value = 'https://jsonplaceholder.typicode.com' + data.name.replace('GET ', '')
  }
}

// 原始历史数据（从数据库加载）
const historyList = ref<any[]>([])
// 过滤后的数据（展示用）
const filteredHistoryList = ref<any[]>([])
// 过滤条件
const historySearchKeyword = ref('')
const historyStatusFilter = ref('all')
// 批量删除模式
const isBatchDeleteMode = ref(false)
const selectedHistoryIds = ref<Set<number>>(new Set())
// 过滤函数（前端筛选）
const applyHistoryFilters = () => {
  let result = [...historyList.value]
  const keyword = historySearchKeyword.value.trim().toLowerCase()

  // 关键词过滤
  if (keyword) {
    result = result.filter(item =>
        item.method.toLowerCase().includes(keyword) ||
        item.url.toLowerCase().includes(keyword) ||
        String(item.response_status).includes(keyword)
    )
  }

  // 状态码过滤
  if (historyStatusFilter.value !== 'all') {
    const prefix = parseInt(historyStatusFilter.value.charAt(0))
    result = result.filter(item => Math.floor(item.response_status / 100) === prefix)
  }

  filteredHistoryList.value = result
}

// 刷新历史（从数据库拉取并重置过滤）
const refreshHistory = async () => {
  if (window.api.getRequestHistory) {
    const rawData = await window.api.getRequestHistory(100) // 可适当增加限制
    // 为每条记录添加 selected 字段（仅用于批量删除）
    historyList.value = rawData.map(item => ({ ...item, selected: false }))
    applyHistoryFilters()
  }
}
// 监听原始数据变化时重新过滤
watch(historyList, () => applyHistoryFilters(), { deep: true })
// 进入批量删除模式
const enterBatchDeleteMode = () => {
  isBatchDeleteMode.value = true
  // 重置所有选中状态
  historyList.value.forEach(item => item.selected = false)
  selectedHistoryIds.value.clear()
}

// 取消批量删除
const cancelBatchDelete = () => {
  isBatchDeleteMode.value = false
  historyList.value.forEach(item => item.selected = false)
  selectedHistoryIds.value.clear()
}

// 更新选中 ID 集合（复选框 change 事件）
const updateSelectedSet = (id: number, selected: boolean) => {
  if (selected) {
    selectedHistoryIds.value.add(id)
  } else {
    selectedHistoryIds.value.delete(id)
  }
}

// 批量删除选中记录（仅本地）
const batchDeleteSelected = async () => {
  if (selectedHistoryIds.value.size === 0) {
    ElMessage.warning('请至少选择一条记录')
    return
  }

  try {
    // 调用主进程删除接口（需新增）
    const ids = Array.from(selectedHistoryIds.value)
    await window.api.deleteHistoryRecords(ids)

    // 从本地列表中移除
    historyList.value = historyList.value.filter(item => !ids.includes(item.id))
    applyHistoryFilters()
    cancelBatchDelete()
    ElMessage.success(`已删除 ${ids.length} 条本地记录`)
  } catch (e) {
    ElMessage.error('删除失败')
  }
}
// 单条删除
const deleteSingleHistory = async (id: number) => {
  try {
    await ElMessageBox.confirm('确定要删除该条本地记录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await window.api.deleteHistoryRecords([id])
    historyList.value = historyList.value.filter(item => item.id !== id)
    applyHistoryFilters()
    ElMessage.success('已删除')
  } catch {
    // 取消操作
  }
}

const truncateUrl = (url: string, maxLen = 30) => {
  return url.length > maxLen ? url.substring(0, maxLen) + '…' : url
}

const loadHistoryItem = async (item: any) => {
  if (isBatchDeleteMode.value) return
  const detail = await window.api.getRequestDetail(item.id)
  method.value = detail.method
  url.value = detail.url
  // 解析 headers
  try {
    const h = JSON.parse(detail.request_headers || '{}')
    headers.value = Object.entries(h).map(([k, v]) => ({ key: k, value: v as string }))
  } catch { /* ignore */ }
  body.value = detail.request_body || ''
  activeTab.value = 'body' // 可选
  ElMessage.success('已加载历史请求')
}// 响应式数据

const logsLoading = ref(false)
const logEntries = ref<Array<{ timestamp: string; line: string; level?: string }>>([])
const lastTraceId = ref<string | null>(null)


const formatTime = (iso: string) => {
  const date = new Date(iso)
  return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
}

// 获取当前请求的日志
const fetchLogsForCurrentRequest = async () => {
  if (!lastTraceId.value) return
  logsLoading.value = true
  try {
    logEntries.value = await window.api.fetchLogs(lastTraceId.value)
  } catch (e) {
    ElMessage.error('获取日志失败')
    console.error(e)
  } finally {
    logsLoading.value = false
  }
}

// 格式化 TraceID 显示（前8后6，中间省略）
const formatTraceId = (traceId: string) => {
  if (traceId.length <= 20) return traceId
  return `${traceId.slice(0, 8)}...${traceId.slice(-6)}`
}

// 复制 TraceID 到剪贴板
const copyTraceId = async () => {
  if (!lastTraceId.value) return
  try {
    await navigator.clipboard.writeText(lastTraceId.value)
    ElMessage.success('TraceID 已复制到剪贴板')
  } catch (e) {
    // 降级方案（某些环境 clipboard API 不可用）
    const input = document.createElement('input')
    input.value = lastTraceId.value
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    ElMessage.success('TraceID 已复制')
  }
}

const openInGrafana = () => {
  if (!lastTraceId.value) return
  const query = `{job="docker_containers"} |= \`${lastTraceId.value}\``
  const leftParam = encodeURIComponent(
      JSON.stringify({
        datasource: 'Loki',
        queries: [{ refId: 'A', expr: query }],
        range: { from: 'now-1h', to: 'now' }
      })
  );

  const url = `http://localhost:3001/explore?orgId=1&left=${leftParam}`;
  window.open(url, '_blank')
}

const diagnosing = ref(false)
const diagnosisResult = ref<DiagnosisResult | null>(null)
const lastErrorResponse = ref<IpcResponse | null>(null)
const lastRequestParams = ref<any>(null)
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
    if (response.status >= 400) {
      lastErrorResponse.value = response
      lastRequestParams.value = { url, method, headers: requestHeaders, body: requestBody }
    } else {
      lastErrorResponse.value = null
      diagnosisResult.value = null
    }
    //5. 更新 UI
    await refreshHistory()
    await refreshUnsyncedCount()
    statusCode.value = response.status
    responseTime.value = response.time
    responseBody.value = response.body
    // 将响应头转换为键值对数组便于表格展示
    responseHeaders.value = Object.entries(response.headers).map(([key, value]) => ({
      key,
      value: value as string
    }))

    // 显示 TraceID
    lastTraceId.value = response.traceId || null
    console.log('TraceID:', response.traceId)
    // 自动拉取日志
    if (lastTraceId.value) {
      await fetchLogsForCurrentRequest()
    }

  } catch (error: any) {
    statusCode.value = 0
    responseBody.value = `请求出错: ${error.message}`
  }
}

const diagnosisError = ref<string | null>(null)
const errorAlertType = ref<'error' | 'warning' | 'info'>('error')
// 重试诊断
const retryDiagnosis = async () => {
  diagnosisError.value = null
  await runDiagnosis()
}
// 执行诊断
const runDiagnosis = async () => {
  if (!lastErrorResponse.value) return
  diagnosing.value = true
  diagnosisError.value = null
  diagnosisResult.value = null
  try {
    // 构建诊断上下文
    const context: DiagnosisContext = {
      request: {
        url: lastRequestParams.value.url,
        method: lastRequestParams.value.method,
        headers: { ...lastRequestParams.value.headers },
        body: lastRequestParams.value.body
      },
      response: {
        status: lastErrorResponse.value.status,
        statusText: lastErrorResponse.value.statusText,
        headers: { ...lastErrorResponse.value.headers },
        body: lastErrorResponse.value.body,
        time: lastErrorResponse.value.time
      },
      logs: logEntries.value.map(l => l.line) // 关联已拉取的日志
    }

    console.log('准备调用 diagnose, 上下文:', context)
    const res = await window.api.diagnose(context)
    if (res.success) {
      diagnosisResult.value = res.result
    } else {
      diagnosisError.value = res.error || '诊断失败'
      // 根据错误类型设置提示风格
      if (res.errorType === 'network') {
        errorAlertType.value = 'warning'
      } else if (res.errorType === 'invalid_key') {
        errorAlertType.value = 'error'
      } else {
        errorAlertType.value = 'info'
      }
    }
  } catch (e: any) {
    diagnosisError.value = e.message || '请求异常'
    errorAlertType.value = 'warning'
  } finally {
    diagnosing.value = false
  }
}

// 一键应用修复
const applyCorrection = () => {
  if (!diagnosisResult.value?.correctedExample) return

  const example = diagnosisResult.value.correctedExample
  // 尝试解析修正示例：可能是 cURL 命令或 JSON body
  if (example.trim().startsWith('curl')) {
    // 调用 cURL 解析器
    const parsed = parseCurl(example)
    if (parsed) {
      method.value = parsed.method
      url.value = parsed.url
      // 将 headers 转换为 KeyValueTable 格式
      headers.value = Object.entries(parsed.headers).map(([k, v]) => ({ key: k, value: v }))
      if (parsed.body) body.value = parsed.body
      ElMessage.success('cURL 已解析并填充')
    } else {
      ElMessage.warning('无法解析 cURL，请手动复制')
    }
  } else {
    // 假设是 JSON body
    try {
      const parsed = JSON.parse(example)
      body.value = JSON.stringify(parsed, null, 2)
      // 如果 Content-Type 未设置，自动设为 JSON
      if (!headers.value.some(h => h.key.toLowerCase() === 'content-type')) {
        headers.value.push({ key: 'Content-Type', value: 'application/json' })
      }
      ElMessage.success('请求体已填充')
    } catch {
      // 不是 JSON，可能是纯文本，直接放入 body
      body.value = example
      ElMessage.success('内容已填充到 Body')
    }
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

const isOnline = ref(navigator.onLine)
const unsyncedCount = ref(0)
const isSyncing = ref(false)

const syncTooltip = computed(() => {
  if (!isOnline.value) return '离线'
  if (unsyncedCount.value > 0) return `${unsyncedCount.value} 条待同步`
  return '已同步'
})

// 更新未同步计数
const refreshUnsyncedCount = async () => {
  if (window.api.getUnsyncedCount) {
    unsyncedCount.value = await window.api.getUnsyncedCount()
  }
}

// 手动触发同步
const triggerManualSync = async () => {
  if (!isOnline.value) {
    ElMessage.warning('当前离线，无法同步')
    return
  }
  isSyncing.value = true
  await window.api.triggerSync()
  isSyncing.value = false
  await refreshUnsyncedCount()
}

// 监听网络事件
window.addEventListener('online', () => isOnline.value = true)
window.addEventListener('offline', () => isOnline.value = false)

// 监听主进程同步完成事件
if (window.api.onSyncCompleted) {
  window.api.onSyncCompleted(() => {
    isSyncing.value = false
    refreshUnsyncedCount()
  })
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

onMounted(async () => {
  console.log('window.api:', window.api)
  currentUser.value = await window.api.getCurrentUser()
  await refreshUnsyncedCount()
})

onUnmounted(() => {
  if (window.api.removeSyncListener) {
    window.api.removeSyncListener()
  }
})
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
  width: 25%;
  background-color: white;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  padding: 12px 0;
}

.history-section {
  margin-top: 16px;
  border-top: 1px solid #e4e7ed;
  padding: 12px 0;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  font-weight: 500;
}

.history-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.history-filters {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #f0f0f0;
}

.history-list {
  height: 13%;
  overflow-y: auto;
  padding: 0 8px;
}

.history-item {
  position: relative;
}

.history-item.batch-mode {
  padding-left: 4px;
}

.history-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  cursor: pointer;
}

.history-item:hover {
  background-color: #f5f7fa;
}

.delete-single-btn {
  opacity: 0;
  transition: opacity 0.2s;
  padding: 0 4px;
}

.history-item:hover .delete-single-btn {
  opacity: 1;
}

.history-method {
  min-width: 45px;
  font-weight: 600;
}

.history-empty {
  text-align: center;
  color: #909399;
  padding: 20px 0;
  font-size: 13px;
}

.method-get { color: #67c23a; }
.method-post { color: #409eff; }
.method-put { color: #e6a23c; }
.method-delete { color: #f56c6c; }

.history-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-status {
  min-width: 35px;
  text-align: right;
}

.status-2 { color: #67c23a; }
.status-4 { color: #f56c6c; }
.status-5 { color: #e6a23c; }
.synced-icon { color: #67c23a; }

.unsynced-icon { color: #909399; }

.sidebar-footer {
  margin-top: auto;
  padding: 12px;
  border-top: 1px solid #e4e7ed;
}

.sync-indicator {
  margin-left: auto;
  margin-right: 16px;
  cursor: pointer;
}

.syncing {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.request-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 45%;
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
  width: 30%;
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

.logs-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.logs-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.logs-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.trace-id-container {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f5f7fa;
  padding: 2px 8px;
  border-radius: 4px;
}

.trace-id-label {
  font-size: 12px;
  color: #909399;
}

.trace-id-value {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #303133;
  background: transparent;
  border: none;
  padding: 0;
}

.logs-list {
  flex: 1;
  overflow-y: auto;
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 8px;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}

.log-entry {
  padding: 2px 0;
  border-bottom: 1px solid #3c3c3c;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-time {
  color: #858585;
  margin-right: 12px;
}
.log-info { color: #4ec9b0; }
.log-warn { color: #dcdcaa; }
.log-error { color: #f14c4c; }
.log-debug { color: #ce9178; }

.logs-empty {
  text-align: center;
  color: #858585;
  padding: 20px;
}
</style>