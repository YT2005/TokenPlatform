import { encryptedDB } from '../database/encrypted-db'
import { LLMAdapter } from './llm-adapter'
import { DeepSeekAdapter } from './adapters/deepseek-adapter'
import { RuleEngineAdapter } from './adapters/rule-engine-adapter'
import {BigmodelAdapter} from "./adapters/bigmodel-adapter";

export async function createLLMAdapter(): Promise<LLMAdapter> {
    const provider = encryptedDB.getSetting('llm.provider') || 'rule'
    console.log('[LLM Factory] 当前配置的 provider:', provider)
    if (provider === 'deepseek') {
        const apiKey = encryptedDB.getSetting('llm.deepseek.apiKey')
        console.log('[LLM Factory] DeepSeek API Key 存在?', !!apiKey)
        if (!apiKey) {
            throw new Error('未配置 DeepSeek API Key,请在设置中填写')
        }
        return new DeepSeekAdapter(apiKey)
    }

    // 可扩展其他提供商...
    if (provider === 'zhipu') {
        const apiKey = encryptedDB.getSetting('llm.zhipu.apiKey')
        console.log('[LLM Factory] zhipu API Key 存在?', !!apiKey)
        if (!apiKey) {
            throw new Error('未配置智谱AI API Key')
        }
        return new BigmodelAdapter(apiKey)
    }
    // 默认使用规则引擎
    return new RuleEngineAdapter()
}