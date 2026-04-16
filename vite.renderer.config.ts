import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
// import { pluginExposeRenderer } from '@electron-forge/plugin-vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
export default defineConfig((env) => {
    const forgeEnv = env as ConfigEnv<'renderer'>;
    const { root, mode, forgeConfigSelf } = forgeEnv;
    const name = forgeConfigSelf.name ?? '';

    return {
        root,
        mode,
        base: './',
        build: {
            outDir: `.vite/renderer/${name}`,
        },
        plugins: [
            vue(),
            AutoImport({
                resolvers: [ElementPlusResolver()],
            }),
            Components({
                resolvers: [ElementPlusResolver()],
            }),
            // pluginExposeRenderer(name),
        ],
        resolve: {
            preserveSymlinks: true,
        },
        clearScreen: false,
    } as UserConfig;
});