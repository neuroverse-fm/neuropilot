import { PermissionLevel } from '@/config';
import { actionHandlerRetry, ActionHandlerResult, StandardRCEAction, actionHandlerSuccess } from '@/utils/neuro_client';
import { RCEContext } from '@ctx/rce';
import { z } from 'zod';

export const standardSchemaActions: Record<string, StandardRCEAction> = {
    test_zod_schema: {
        name: 'test_zod_schema',
        description: 'Testing the Zod schema',
        schema: z.object({
            args: z.array(z.string()),
        }),
        handler: handleTestZodSchema,
        promptGenerator: null,
        hidden: true,
        defaultPermission: PermissionLevel.AUTOPILOT,
        category: 'Misc',
    },
};

export function handleTestZodSchema(ctx: RCEContext): ActionHandlerResult {
    if (!ctx.data.params?.args) {
        return actionHandlerRetry('Missing args from test zod schema');
    } else {
        return actionHandlerSuccess();
    }
}
