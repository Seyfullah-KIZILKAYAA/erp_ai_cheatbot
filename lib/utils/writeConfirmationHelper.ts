import { PendingWriteAction, WriteConfirmationData, WriteFieldInfo } from '../types/writeConfirmation';
import { WRITE_INTENT_CONFIGS, WriteIntentKey } from '../config/writeFieldDefinitions';

export function buildWriteConfirmationResponse(
    intentKey: WriteIntentKey,
    agentKey: string,
    extractedData: Record<string, any>
): { content: string; data: WriteConfirmationData; ui_component: 'write_confirmation' } {

    const config = WRITE_INTENT_CONFIGS[intentKey];

    const fields: WriteFieldInfo[] = config.fields.map(f => ({
        ...f,
        value: extractedData[f.field] ?? null
    }));

    const missingOptional = fields.filter(f => !f.required && (f.value === null || f.value === undefined || f.value === ''));

    const values: Record<string, any> = {};
    fields.forEach(f => {
        if (f.value !== null && f.value !== undefined && f.value !== '') {
            values[f.field] = f.value;
        }
    });

    const actionId = `write-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    const pendingAction: PendingWriteAction = {
        actionId,
        actionType: intentKey,
        agentKey,
        model: config.model,
        fields,
        values,
        step: missingOptional.length > 0 ? 'missing_check' : 'confirm',
        missingFields: missingOptional.map(f => f.label),
    };

    let content: string;
    if (pendingAction.step === 'missing_check') {
        const missingList = missingOptional.map(f => `- **${f.label}**`).join('\n');
        content =
            `## ${config.title}\n\n` +
            `Veriler çıkartıldı ancak şu alanlar eksik:\n\n${missingList}\n\n` +
            `Eksik alanlarla devam etmek istiyor musunuz?`;
    } else {
        content =
            `## ${config.title}\n\n` +
            `Aşağıdaki veriler Odoo'ya kaydedilecek. Onaylıyor musunuz?`;
    }

    return {
        content,
        data: { pendingAction, title: config.title, message: content },
        ui_component: 'write_confirmation'
    };
}
