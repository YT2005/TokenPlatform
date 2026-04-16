<template>
  <KeyValueTable :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
</template>

<script setup lang="ts">
import KeyValueTable from './KeyValueTable.vue'

interface KV {
  key: string
  value: string
}

defineProps<{
  modelValue: KV[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: KV[]): void
}>()
</script>