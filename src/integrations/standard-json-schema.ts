import { PermissionLevel } from '@/config';
import { actionHandlerRetry, actionHandlerSuccess, defineAction } from '@/utils/neuro_client';
import { z } from 'zod';

export const standardSchemaActions = {
    test_zod_schema: defineAction({
        name: 'test_zod_schema',
        description: 'Testing the Zod schema',
        schema: z.object({
            args: z.array(z.string()),
        }),
        handler(ctx) {
            if (!ctx.data.params?.args) {
                return actionHandlerRetry('Missing args from test zod schema');
            } else {
                return actionHandlerSuccess();
            }
        },
        promptGenerator: null,
        hidden: true,
        defaultPermission: PermissionLevel.AUTOPILOT,
        category: 'Misc',
    }),
};
