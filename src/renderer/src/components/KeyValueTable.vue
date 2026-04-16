<template>
  <div class="kv-table">
    <el-table :data="localData" border style="width: 100%">
      <el-table-column prop="key" label="Key" width="180">
        <template #default="{ row, $index }">
          <el-input v-if="!readonly" v-model="row.key" placeholder="Key" size="small" />
          <span v-else>{{ row.key }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="value" label="Value">
        <template #default="{ row, $index }">
          <el-input v-if="!readonly" v-model="row.value" placeholder="Value" size="small" />
          <span v-else>{{ row.value }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="!readonly" label="操作" width="80">
        <template #default="{ $index }">
          <el-button type="danger" link @click="removeRow($index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-button v-if="!readonly" class="add-btn" type="primary" link @click="addRow">
      + 添加
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface KV {
  key: string
  value: string
}

const props = defineProps<{
  modelValue: KV[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: KV[]): void
}>()

const localData = ref<KV[]>(props.modelValue || [])

watch(() => props.modelValue, (newVal) => {
  localData.value = newVal || []
}, { deep: true })

watch(localData, (newVal) => {
  emit('update:modelValue', newVal)
}, { deep: true })

const addRow = () => {
  localData.value.push({ key: '', value: '' })
}

const removeRow = (index: number) => {
  localData.value.splice(index, 1)
}
</script>

<style scoped>
.kv-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.add-btn {
  align-self: flex-start;
}
</style>