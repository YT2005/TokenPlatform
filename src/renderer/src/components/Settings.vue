<template>
  <div class="settings-panel">
    <h3>AI 诊断配置</h3>
    <el-form label-width="100px">
      <el-form-item label="诊断引擎">
        <el-select v-model="llmProvider" placeholder="选择引擎">
          <el-option label="规则引擎 (离线)" value="rule" />
          <el-option label="DeepSeek" value="deepseek" />
          <el-option label="智谱AI (GLM)" value="zhipu" />
        </el-select>
      </el-form-item>
      <el-form-item label="API Key" v-if="llmProvider !== 'rule'">
        <el-input v-model="llmApiKey" type="password" show-password placeholder="输入 API Key" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="saveLLMSettings">保存配置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">

import {onMounted, ref} from "vue";
import {ElMessage} from "element-plus";

const llmProvider = ref('rule')
const llmApiKey = ref('')



const saveLLMSettings = async () => {
  // 当用户选择智谱AI时，将API Key存储到 'llm.zhipu.apiKey'
  const config: any = {
    provider: llmProvider.value
  }

  if (llmProvider.value === 'deepseek') {
    config.apiKey = llmApiKey.value
    await window.api.saveLLMConfig({ ...config, keyType: 'deepseek' })
  } else if (llmProvider.value === 'zhipu') {
    config.apiKey = llmApiKey.value
    await window.api.saveLLMConfig({ ...config, keyType: 'zhipu' })
  } else {
    await window.api.saveLLMConfig(config)
  }
  ElMessage.success('配置已保存')
}



onMounted(async () => {
  const config = await window.api.getLLMConfig()
  llmProvider.value = config.provider
})

</script>