# 🤖 ERP AI Chatbot - Odoo Integration 🚀

An intelligent ERP Assistant that allows you to query your business data using natural language. Built with **Next.js 15+**, **React 19**, **Django**, and the ultra-fast **Groq AI API** (Llama 3.3). This version features real-time **Odoo ERP** integration via XML-RPC and **Role-Based AI Access (RBAA)**.

![Project Status](https://img.shields.io/badge/Status-Active-success)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![React](https://img.shields.io/badge/React-19-blue)
![Django](https://img.shields.io/badge/Backend-Django-green)
![Odoo](https://img.shields.io/badge/ERP-Odoo-purple)
![Groq](https://img.shields.io/badge/AI-Groq%20(Llama%203.3)-orange)

## 🌟 Core Features

- **🛡️ Role-Based AI Access (RBAA)**: Strict permission controls managed via a Django backend. AI only accesses tables authorized for the specific user role (e.g., Admin, Manager, Staff).
- **💬 Natural Language Odoo Querying**: Ask questions like "Who are my top customers?" or "Show me low stock products". The AI understands Odoo models like `res.partner`, `sale.order`, and `product.product`.
- **📈 Adaptive UI (Generative UI)**: Automatically renders data in the most suitable format:
  - **📊 Charts**: For trends and comparisons (powered by Recharts).
  - **📋 Tables**: For detailed lists and data grids.
  - **🏷️ Stat Cards**: For single metrics and totals.
  - **📉 Line Charts**: For time-series trend analysis.
- **🔮 Smart Forecasting**: AI-driven trend analysis of historical Odoo data to predict future business metrics.
- **🎙️ Voice Interaction**: Integrated **Speech-to-Text** (input) and **Text-to-Speech** (response).
- **🚀 Ultra-Fast AI**: Powered by Groq's high-speed inference engine using the **Llama 3.3 70B** model.
- **💾 Session Management**: Multi-session chat history persisted locally and linked to user profiles.

## 🛠️ Tech Stack

- **Frontend**: [Next.js 15+](https://nextjs.org/), [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Backend (Auth & RBAA)**: [Django](https://www.djangoproject.com/), [Django REST Framework](https://www.django-rest-framework.org/)
- **AI Engine**: [Groq Cloud](https://groq.com/) (Llama-3.3-70b-versatile)
- **ERP Connection**: [Odoo XML-RPC](https://www.odoo.com/documentation/17.0/developer/howto/api.html)

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/Seyfullah-KIZILKAYAA/erp_ai_cheatbot.git
cd erp_ai_cheatbot
```

### 2. Configure Backend (Django)
```bash
cd backend
python -m venv venv
# Windows
.\venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py sync_odoo_models  # Syncs all available Odoo tables
python manage.py seed_data        # Creates demo users (Admin, Mehmet, Ayşe)
python manage.py runserver 8000
```

### 3. Configure Frontend (Next.js)
```bash
# In the root directory
npm install
npm run dev
```

### 4. Environment Variables (.env.local)
Create a `.env.local` file in the root:
```env
# AI API
GROQ_API_KEY=your_groq_api_key

# Odoo Integration
ODOO_URL=http://your-odoo-instance.com
ODOO_DB=your_db_name
ODOO_USERNAME=your_username
ODOO_PASSWORD=your_api_key_or_password
```

## 💡 How It Works (The "Brain")

1. **Authentication**: User logs in via the Django-integrated frontend. The user's role and allowed tables are loaded.
2. **Filtered Schema**: The AI is only provided with the schema metadata for tables the user has permission to access.
3. **Intention Analysis**: The user sends a query.
4. **Action Generation**: AI generates a structured "Action JSON" within its security boundaries.
5. **XML-RPC Execution**: The system fetches data from Odoo and renders the adaptive UI.

## 📄 License

This project is open-source and available for educational purposes. Feel free to contribute!
