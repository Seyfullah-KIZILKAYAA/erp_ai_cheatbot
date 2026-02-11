# 🤖 ERP AI Chatbot - Odoo Integration 🚀

An intelligent ERP Assistant that allows you to query your business data using natural language. Built with **Next.js 15+**, **React 19**, **Django**, and the ultra-fast **Groq AI API** (Llama 3.3). This version features real-time **Odoo ERP** integration via XML-RPC and includes a live dashboard for instant business metrics.

![Project Status](https://img.shields.io/badge/Status-Active-success)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![React](https://img.shields.io/badge/React-19-blue)
![Django](https://img.shields.io/badge/Backend-Django-green)
![Odoo](https://img.shields.io/badge/ERP-Odoo-purple)
![Groq](https://img.shields.io/badge/AI-Groq%20(Llama%203.3)-orange)
![License](https://img.shields.io/badge/License-MIT-blue)

## 🌟 Core Features

- **📊 Live Dashboard Sidebar**: A persistent right-hand sidebar displaying real-time business metrics (Active Customers, Orders, Products, Quotations). Click on any card to instantly query detailed lists.
- **🔓 Direct Access**: Simplified access without mandatory login, allowing instant interaction with the ERP assistant.
- **💬 Natural Language Odoo Querying**: Ask questions like "Who are my top customers?" or "Show me low stock products". The AI understands Odoo models like `res.partner`, `sale.order`, and `product.product`.
- **📈 Adaptive UI (Generative UI)**: Automatically renders data in the most suitable format:
  - **📊 Charts**: For trends and comparisons (powered by Recharts).
  - **📋 Tables**: For detailed lists and improved visual clarity.
  - **🏷️ Stat Cards**: For single metrics and totals.
  - **📉 Line Charts**: For time-series trend analysis.
- **🔮 Smart Analysis**: Precise data summaries without repeating table contents in text. Focuses on brief, professional insights.
- **🎙️ Voice Interaction**: Integrated **Speech-to-Text** (input) and **Text-to-Speech** (response) for hands-free operation.
- **🚀 Ultra-Fast AI**: Powered by Groq's high-speed inference engine using the **Llama 3.3 70B** model.
- **💾 Session Management**: Multi-session chat history persisted locally in the browser.

## 🛠️ Tech Stack

- **Frontend**: [Next.js 15+](https://nextjs.org/), [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/)
- **Backend**: [Django](https://www.djangoproject.com/), [Django REST Framework](https://www.django-rest-framework.org/)
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
python manage.py runserver 8000
```

### 3. Configure Frontend (Next.js)
```bash
# In the root directory
npm install
npm run dev
```

### 4. Environment Variables (.env.local)
Create a `.env.local` file in the root directory:
```env
# AI API
GROQ_API_KEY=your_groq_api_key

# Odoo Integration
ODOO_URL=http://localhost:8069
ODOO_DB=your_db_name
ODOO_USERNAME=your_username
ODOO_PASSWORD=your_api_key_or_password
```

## 💡 How It Works (The "Brain")

1. **Intention Analysis**: The user sends a query (Voice or Text).
2. **Action Generation**: AI generates a structured "Action JSON" to fetch relevant Odoo data.
3. **XML-RPC Execution**: The system fetches real-time data from Odoo via XML-RPC.
4. **Adaptive Rendering**: Data is visualized as tables, charts, or stats based on the response type.
5. **Live Status**: The dashboard sidebar independently fetches key metrics to keep you updated at a glance.

## 📄 License

This project is open-source and available for educational purposes. Feel free to contribute!
