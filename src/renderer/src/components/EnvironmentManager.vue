<template>
  <div class="env-manager">
    <div class="env-header">
      <h3>环境管理</h3>
      <el-button type="primary" size="small" @click="showAddEnvDialog = true">
        <el-icon><Plus /></el-icon> 新建环境
      </el-button>
    </div>

    <!-- 环境列表 -->
    <el-radio-group v-model="currentEnvId" @change="switchEnvironment" class="env-list">
      <el-radio
          v-for="env in environments"
          :key="env.id"
          :value="env.id"
          border
          class="env-item"
      >
        <span class="env-name">
          {{ env.name }}
          <el-tag v-if="env.is_default" size="small" type="success">当前</el-tag>
        </span>
        <div class="env-actions">
          <el-button link @click.stop="editEnvironment(env)">
            <el-icon><Edit /></el-icon>
          </el-button>
          <el-button link @click.stop="deleteEnvironment(env.id)" :disabled="env.is_default === 1">
            <el-icon><Delete /></el-icon>
          </el-button>
          <el-button link @click.stop="setDefault(env.id)" v-if="!env.is_default">
            <el-icon><Check /></el-icon>
          </el-button>
        </div>
      </el-radio>
    </el-radio-group>

    <!-- 变量表格（仅当选中环境时显示） -->
    <div v-if="currentEnvId" class="variables-section">
      <div class="variables-header">
        <h4>环境变量</h4>
        <el-button size="small" @click="showAddVarDialog = true">
          <el-icon><Plus /></el-icon> 添加变量
        </el-button>
      </div>
      <el-table :data="currentVariables" border style="width: 100%">
        <el-table-column prop="key" label="变量名" width="180" />
        <el-table-column prop="value" label="值">
          <template #default="{ row }">
            <span v-if="row.encrypted">********</span>
            <span v-else>{{ row.value }}</span>
          </template>
        </el-table-column>
        <el-table-column label="加密" width="80">
          <template #default="{ row }">
            <el-icon v-if="row.encrypted"><Lock /></el-icon>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button link @click="editVariable(row)">编辑</el-button>
            <el-button link @click="deleteVariable(row.key)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新建/编辑环境对话框 -->
    <el-dialog v-model="showAddEnvDialog" :title="editingEnv ? '编辑环境' : '新建环境'" width="400px">
      <el-form :model="envForm" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="envForm.name" placeholder="例如：生产环境" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="envForm.description" type="textarea" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddEnvDialog = false">取消</el-button>
        <el-button type="primary" @click="saveEnvironment">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新建/编辑变量对话框 -->
    <el-dialog v-model="showAddVarDialog" :title="editingVar ? '编辑变量' : '添加变量'" width="400px">
      <el-form :model="varForm" label-width="80px">
        <el-form-item label="变量名">
          <el-input v-model="varForm.key" placeholder="例如：baseUrl" :disabled="!!editingVar" />
        </el-form-item>
        <el-form-item label="值">
          <el-input v-model="varForm.value" type="textarea" placeholder="变量值" />
        </el-form-item>
        <el-form-item label="加密存储">
          <el-switch v-model="varForm.encrypted" />
          <span class="hint">敏感信息建议加密（如Token、密码）</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddVarDialog = false">取消</el-button>
        <el-button type="primary" @click="saveVariable">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Check, Lock } from '@element-plus/icons-vue'

interface Environment {
  id: number
  name: string
  description: string
  is_default: number
}

interface Variable {
  key: string
  value: string
  encrypted: number
}

const environments = ref<Environment[]>([])
const currentEnvId = ref<number | null>(null)
const currentVariables = ref<Variable[]>([])

const showAddEnvDialog = ref(false)
const showAddVarDialog = ref(false)
const editingEnv = ref<Environment | null>(null)
const editingVar = ref<Variable | null>(null)

const envForm = ref({ name: '', description: '' })
const varForm = ref({ key: '', value: '', encrypted: false })

// 加载环境列表
const loadEnvironments = async () => {
  environments.value = await window.api.getEnvironments()
  const defaultEnv = environments.value.find(e => e.is_default === 1)
  if (defaultEnv) {
    currentEnvId.value = defaultEnv.id
    await loadVariables(defaultEnv.id)
  }
}

// 加载当前环境的变量
const loadVariables = async (envId: number) => {
  currentVariables.value = await window.api.getEnvVariables(envId)
}

// 切换环境
const switchEnvironment = async (envId: number) => {
  await loadVariables(envId)
}

// 设为默认环境
const setDefault = async (id: number) => {
  await window.api.setDefaultEnvironment(id)
  await loadEnvironments()
  ElMessage.success('默认环境已切换')
}

// 保存环境（新建或编辑）
const saveEnvironment = async () => {
  if (!envForm.value.name.trim()) {
    ElMessage.warning('请输入环境名称')
    return
  }
  if (editingEnv.value) {
    await window.api.updateEnvironment(editingEnv.value.id, envForm.value.name, envForm.value.description)
  } else {
    await window.api.createEnvironment(envForm.value.name, envForm.value.description)
  }
  showAddEnvDialog.value = false
  editingEnv.value = null
  envForm.value = { name: '', description: '' }
  await loadEnvironments()
}

const editEnvironment = (env: Environment) => {
  editingEnv.value = env
  envForm.value = { name: env.name, description: env.description || '' }
  showAddEnvDialog.value = true
}

const deleteEnvironment = async (id: number) => {
  await ElMessageBox.confirm('确定删除该环境？关联的所有变量将被清除。', '警告', { type: 'warning' })
  await window.api.deleteEnvironment(id)
  await loadEnvironments()
  if (currentEnvId.value === id) {
    currentEnvId.value = null
    currentVariables.value = []
  }
}

// 变量操作
const saveVariable = async () => {
  if (!varForm.value.key.trim() || !currentEnvId.value) return
  await window.api.saveEnvVariable(currentEnvId.value, varForm.value.key, varForm.value.value, varForm.value.encrypted)
  showAddVarDialog.value = false
  editingVar.value = null
  varForm.value = { key: '', value: '', encrypted: false }
  await loadVariables(currentEnvId.value)
}

const editVariable = (v: Variable) => {
  editingVar.value = v
  varForm.value = { key: v.key, value: v.value, encrypted: v.encrypted === 1 }
  showAddVarDialog.value = true
}

const deleteVariable = async (key: string) => {
  if (!currentEnvId.value) return
  await ElMessageBox.confirm(`确定删除变量 "${key}"？`, '提示', { type: 'warning' })
  await window.api.deleteEnvVariable(currentEnvId.value, key)
  await loadVariables(currentEnvId.value)
}

onMounted(loadEnvironments)
</script>

<style scoped>
.env-manager { padding: 16px; }
.env-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.env-list { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.env-item { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 8px 12px; }
.env-name { display: flex; align-items: center; gap: 8px; }
.env-actions { display: flex; gap: 4px; }
.variables-section { margin-top: 24px; }
.variables-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.hint { margin-left: 8px; color: #909399; font-size: 12px; }
</style>