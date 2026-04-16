<template>
  <div class="body-editor">
    <div class="editor-header">
      <el-radio-group v-model="localContentType" size="small">
        <el-radio-button value="JSON">JSON</el-radio-button>
        <el-radio-button value="Form Data">Form Data</el-radio-button>
        <el-radio-button value="Raw">Raw</el-radio-button>
      </el-radio-group>
    </div>
    <el-input
        v-model="localBody"
        type="textarea"
        :rows="12"
        placeholder="输入请求体"
        @input="emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string
  contentType: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:contentType', value: string): void
}>()

const localBody = ref(props.modelValue)
const localContentType = ref(props.contentType)

watch(() => props.modelValue, (val) => { localBody.value = val })
watch(() => props.contentType, (val) => { localContentType.value = val })

watch(localContentType, (val) => {
  emit('update:contentType', val)
})
</script>

<style scoped>
.body-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.editor-header {
  display: flex;
  justify-content: flex-start;
}
</style>