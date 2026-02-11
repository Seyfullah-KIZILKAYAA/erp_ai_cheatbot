# 🤖 ERP AI Chatbot - Odoo Intelligence 🚀

An intelligent ERP Assistant that allows you to query your business data using natural language. Built with **Next.js 15+**, **React 19**, **Django**, and the ultra-fast **Groq AI API** (Llama 3.3). This version features real-time **Odoo ERP** integration via XML-RPC and includes a live dashboard for instant business metrics.

![Project Status](https://img.shields.io/badge/Status-Active-success)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![React](https://img.shields.io/badge/React-19-blue)
![Django](https://img.shields.io/badge/Backend-Django-green)
![Odoo](https://img.shields.io/badge/ERP-Odoo-purple)
![Groq](https://img.shields.io/badge/AI-Groq%20(Llama%203.3)-orange)
![License](https://img.shields.io/badge/License-MIT-blue)

## 🌟 Core Features

### 🧠 Intelligent Analysis & Reasoning
- **📢 Executive Daily Briefing**: A one-click "Daily Summary" feature that aggregates critical business data (revenue, new customers, low stock) into a concise, AI-generated executive report.
- **🤔 Chain of Thought (Reasoning) UI**: Visualizes the AI's step-by-step thinking process (Analyzing -> Database Connection -> Data Processing -> Visualization) for professional transparency.
- **💬 Natural Language Odoo Querying**: Ask complex questions like *"Top 5 customers this month"* or *"List products with low stock"*. The AI understands Odoo models like `res.partner`, `sale.order`, and `product.product`.

### 📊 Dynamic Dashboard & Visualizations
- **⚡ Real-Time Dashboard Sidebar**: A persistent right-hand sidebar showing live metrics for Customers, Orders, Products, and Quotations directly from Odoo.
- **📈 Generative UI (Adaptive Rendering)**: Automatically selects and renders the best visual format for data:
  - **📊 Interactive Charts**: Statistical trends and comparisons (powered by Recharts).
  - **📋 Smart Data Tables**: Clean, searchable, and professional data presentation.
  - **🏷️ Key Metric Cards**: Instant visibility for critical numbers.
- **📄 PDF Report Export**: Export chat history and data tables directly to high-quality PDF files for offline review or sharing.

### 🎙️ Advanced Interaction & UX
- **🎙️ Voice-First Experience**: 
  - **Speech-to-Text**: Voice-command input for hands-free querying.
  - **Text-to-Speech**: High-quality voice responses for an interactive AI personal assistant feel.
- **💾 Session Management**: Multi-thread chat history stored locally, allowing users to manage multiple independent inquiries.
- **🎨 Glassmorphism Design**: High-end, modern UI using CSS Modules with glassmorphism effects, optimized for both desktop and mobile viewports.

## 🛠️ Tech Stack

- **Frontend**: Next.js 15+, React 19, Lucide Icons, Recharts, jsPDF.
- **Styling**: Vanilla CSS Modules (Premium Glassmorphism Design).
- **Backend**: Django & Django REST Framework.
- **AI Intelligence**: Groq Cloud (Llama 3.3 70B Model).
- **ERP Integration**: Odoo XML-RPC API.

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

## 📄 License

This project is open-source and available for educational purposes. Feel free to contribute!
