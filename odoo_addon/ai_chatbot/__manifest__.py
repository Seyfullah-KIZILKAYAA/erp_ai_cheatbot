
{
    'name': 'AI ERP Assistant',
    'version': '1.0',
    'category': 'Tools',
    'summary': 'AI Chatbot Integration for ERP',
    'description': 'This module integrates an external AI Chatbot as a module view within Odoo.',
    'author': 'Seyfullah KIZILKAYA',
    'website': 'https://github.com/Seyfullah-KIZILKAYAA/erp_ai_cheatbot',
    'depends': ['base', 'web'],
    'data': [
        'views/chatbot_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'ai_chatbot/static/src/js/chatbot_dashboard.js',
            'ai_chatbot/static/src/xml/chatbot_dashboard.xml',
        ],
    },
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}
