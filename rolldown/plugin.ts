import { Plugin } from 'rolldown';

export const watcherPlugin: Plugin = {
    name: 'rolldown-plugin-build-watcher',
    buildStart: () => {
        console.log('[rolldown] build started');
    },
    buildEnd: (erm) => {
        console.log('[rolldown] build ended');
        if (erm) console.error(erm);
    },
    watchChange: () => {
        console.log('[rolldown] build restarted');
    },
};
