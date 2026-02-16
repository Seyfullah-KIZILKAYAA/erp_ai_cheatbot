export interface WriteFieldInfo {
    field: string;
    label: string;
    value: any;
    required: boolean;
}

export interface PendingWriteAction {
    actionId: string;
    actionType: string;
    agentKey: string;
    model: string;
    fields: WriteFieldInfo[];
    values: Record<string, any>;
    step: 'missing_check' | 'confirm';
    missingFields: string[];
    resolved?: 'confirmed' | 'cancelled';
}

export interface WriteConfirmationData {
    pendingAction: PendingWriteAction;
    title: string;
    message: string;
}
