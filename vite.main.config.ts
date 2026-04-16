import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        rollupOptions: {
            external: [
                'better-sqlite3',
                '@journeyapps/sqlcipher',
            ],
        },
        commonjsOptions: {
            ignoreTryCatch: false,
        },
    },
    optimizeDeps: {
        exclude: ['better-sqlite3', '@journeyapps/sqlcipher'],
    },
});