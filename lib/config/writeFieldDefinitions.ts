import { WriteFieldInfo } from '../types/writeConfirmation';

export type WriteIntentKey =
    | 'create_customer' | 'update_customer' | 'create_order' | 'confirm_order'
    | 'create_employee' | 'update_employee'
    | 'create_product' | 'update_product'
    | 'create_invoice' | 'update_invoice'
    | 'create_purchase' | 'update_purchase'
    | 'create_lead' | 'update_lead';

interface WriteIntentConfig {
    model: string;
    title: string;
    fields: Omit<WriteFieldInfo, 'value'>[];
}

export const WRITE_INTENT_CONFIGS: Record<WriteIntentKey, WriteIntentConfig> = {
    create_customer: {
        model: 'res.partner',
        title: 'Yeni Müşteri Oluşturma',
        fields: [
            { field: 'name', label: 'Ad / Şirket Adı', required: true },
            { field: 'email', label: 'E-posta', required: false },
            { field: 'phone', label: 'Telefon', required: false },
            { field: 'city', label: 'Şehir', required: false },
            { field: 'is_company', label: 'Şirket mi?', required: false },
        ]
    },
    create_order: {
        model: 'sale.order',
        title: 'Yeni Satış Siparişi',
        fields: [
            { field: 'partner_name', label: 'Müşteri Adı', required: true },
        ]
    },
    confirm_order: {
        model: 'sale.order',
        title: 'Sipariş Onaylama',
        fields: [
            { field: 'order_name', label: 'Sipariş No', required: true },
        ]
    },
    create_employee: {
        model: 'hr.employee',
        title: 'Yeni Personel Oluşturma',
        fields: [
            { field: 'name', label: 'Ad Soyad', required: true },
            { field: 'work_email', label: 'İş E-postası', required: false },
            { field: 'mobile_phone', label: 'Cep Telefonu', required: false },
            { field: 'department_name', label: 'Departman', required: false },
            { field: 'job_title', label: 'Pozisyon', required: false },
            { field: 'company_name', label: 'Şirket', required: false },
        ]
    },
    update_employee: {
        model: 'hr.employee',
        title: 'Personel Güncelleme',
        fields: [
            { field: 'employee_name', label: 'Güncellenecek Personel', required: true },
            { field: 'company_name', label: 'Yeni Şirket', required: false },
            { field: 'department_name', label: 'Yeni Departman', required: false },
            { field: 'job_title', label: 'Yeni Pozisyon', required: false },
            { field: 'work_email', label: 'Yeni E-posta', required: false },
            { field: 'mobile_phone', label: 'Yeni Telefon', required: false },
        ]
    },
    create_product: {
        model: 'product.product',
        title: 'Yeni Ürün Oluşturma',
        fields: [
            { field: 'name', label: 'Ürün Adı', required: true },
            { field: 'list_price', label: 'Satış Fiyatı', required: false },
            { field: 'default_code', label: 'Ürün Kodu', required: false },
            { field: 'type', label: 'Ürün Tipi', required: false },
        ]
    },
    create_invoice: {
        model: 'account.move',
        title: 'Yeni Fatura Oluşturma',
        fields: [
            { field: 'partner_name', label: 'Müşteri Adı', required: true },
        ]
    },
    create_purchase: {
        model: 'purchase.order',
        title: 'Yeni Satın Alma Siparişi',
        fields: [
            { field: 'partner_name', label: 'Tedarikçi Adı', required: true },
        ]
    },
    update_customer: {
        model: 'res.partner',
        title: 'Müşteri Güncelleme',
        fields: [
            { field: 'customer_name', label: 'Güncellenecek Müşteri', required: true },
            { field: 'name', label: 'Yeni Ad', required: false },
            { field: 'email', label: 'Yeni E-posta', required: false },
            { field: 'phone', label: 'Yeni Telefon', required: false },
            { field: 'city', label: 'Yeni Şehir', required: false },
        ]
    },
    update_product: {
        model: 'product.product',
        title: 'Ürün Güncelleme',
        fields: [
            { field: 'product_name', label: 'Güncellenecek Ürün', required: true },
            { field: 'name', label: 'Yeni Ürün Adı', required: false },
            { field: 'list_price', label: 'Yeni Fiyat', required: false },
            { field: 'default_code', label: 'Yeni Ürün Kodu', required: false },
        ]
    },
    update_invoice: {
        model: 'account.move',
        title: 'Fatura Güncelleme',
        fields: [
            { field: 'invoice_name', label: 'Güncellenecek Fatura', required: true },
            { field: 'partner_name', label: 'Yeni Müşteri', required: false },
        ]
    },
    update_purchase: {
        model: 'purchase.order',
        title: 'Satın Alma Güncelleme',
        fields: [
            { field: 'po_name', label: 'Güncellenecek Sipariş', required: true },
            { field: 'partner_name', label: 'Yeni Tedarikçi', required: false },
        ]
    },
    create_lead: {
        model: 'crm.lead',
        title: 'Yeni CRM Fırsatı',
        fields: [
            { field: 'name', label: 'Fırsat Adı', required: true },
            { field: 'partner_name', label: 'Müşteri Adı', required: false },
            { field: 'expected_revenue', label: 'Beklenen Gelir', required: false },
        ]
    },
    update_lead: {
        model: 'crm.lead',
        title: 'CRM Fırsatı Güncelleme',
        fields: [
            { field: 'lead_name', label: 'Güncellenecek Fırsat', required: true },
            { field: 'name', label: 'Yeni Fırsat Adı', required: false },
            { field: 'partner_name', label: 'Yeni Müşteri', required: false },
            { field: 'expected_revenue', label: 'Yeni Beklenen Gelir', required: false },
            { field: 'stage_name', label: 'Yeni Aşama', required: false },
        ]
    }
};
