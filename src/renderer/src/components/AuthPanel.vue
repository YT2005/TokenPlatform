<template>
  <div class="auth-panel">
    <el-select v-model="authType" placeholder="认证类型">
      <el-option label="No Auth" value="none" />
      <el-option label="Bearer Token" value="bearer" />
      <el-option label="Basic Auth" value="basic" />
      <el-option label="API Key" value="apikey" />
    </el-select>

    <!-- Bearer Token 配置 -->
    <div v-if="authType === 'bearer'" class="token-input">
      <el-input v-model="currentDomain" placeholder="输入域名 (例如 api.example.com)" />
      <el-input v-model="token" placeholder="输入 Token" show-password style="margin-top: 8px"/>
      <el-button :loading="saving" @click="saveTokenToVault" size="small" style="margin-top: 8px">
        保存到保险箱
      </el-button>
      <el-divider />
      <div>保险箱中的 Token：</div>
      <el-table :data="vaultTokens" style="margin-top: 8px">
        <el-table-column prop="domain" label="域名" />
        <el-table-column label="操作">
          <template #default="{ row }">
            <el-button type="danger" link @click="deleteToken(row.domain)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <!-- 其他认证类型可类似扩展 -->
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {ElMessage} from "element-plus";

const authType = ref('none')
const token = ref('')
const currentDomain = ref('')
const vaultTokens = ref< {domain : string}[] >([])
const loading = ref(false)
const saving = ref(false)
// 从主进程获取当前请求的域名
const loadVaultTokens = async () => {
  loading.value = true
  try {
    const domains = await window.api.getTokenDomains()
    vaultTokens.value = domains.map(d => ({ domain: d }))
  } catch (e) {
    ElMessage.error('获取保险箱列表失败')
  } finally {
    loading.value = false
  }
}
const saveTokenToVault = async () => {
  // 通过 IPC 保存
  if (!currentDomain.value.trim()) {
    ElMessage.warning('请输入域名')
    return
  }
  if (!token.value.trim()) {
    ElMessage.warning('请输入 Token')
    return
  }
  saving.value = true
  try {
    window.api.saveToken(currentDomain.value.trim(), token.value)
    token.value = ''
    currentDomain.value = ''
    await loadVaultTokens()
    ElMessage.success('Token 已加密存入保险箱')
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

const deleteToken = async (domain: string) => {
  try {
    await window.api.deleteToken(domain)
    await loadVaultTokens()
    ElMessage.success('已删除')
  } catch (e) {
    ElMessage.error('删除失败')
  }
}
onMounted(() => {
  loadVaultTokens()
})
</script>

<style scoped>
.auth-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.token-input {
  display: flex;
  flex-direction: column;
}
</style>