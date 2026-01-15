# 🤖 ERP AI Chatbot - Odoo Integration 🚀

An intelligent ERP Assistant that allows you to query your business data using natural language. Built with **Next.js 15+**, **React 19**, and the ultra-fast **Groq AI API** (Llama 3.3). This version features real-time **Odoo ERP** integration via XML-RPC.

![Project Status](https://img.shields.io/badge/Status-Active-success)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![React](https://img.shields.io/badge/React-19-blue)
![Odoo](https://img.shields.io/badge/ERP-Odoo-purple)
![Groq](https://img.shields.io/badge/AI-Groq%20(Llama%203.3)-orange)

## 🌟 Core Features

- **💬 Natural Language Odoo Querying**: Ask questions like "Who are my top customers?" or "Show me low stock products" in plain Turkish or English. The AI understands Odoo models like `res.partner`, `sale.order`, and `product.product`.
- **📈 Adaptive UI (Generative UI)**: Automatically renders data in the most suitable format:
  - **📊 Charts**: For trends and comparisons (powered by Recharts).
  - **📋 Tables**: For detailed lists and data grids.
  - **🏷️ Stat Cards**: For single metrics and totals.
  - **📉 Line Charts (New!)**: For time-series trend analysis and forecasting.
- **🔮 Smart Forecasting**: AI-driven trend analysis of historical Odoo data to predict future business metrics (e.g., next month's sales or stock needs).
- **🛡️ Resilient Search (Fallback Engine)**: Intelligent fuzzy matching (ilike) and automatic fallback to suggested records if a specific query returns no results.
- **🎙️ Voice Interaction**: Hands-free operation with integrated **Speech-to-Text** (input) and **Text-to-Speech** (response).
- **🚀 Ultra-Fast AI (Sub-second response)**: Powered by Groq's high-speed inference engine using the **Llama 3.3 70B** model.
- **🛡️ Secure XML-RPC Bridge**: Communicates directly with Odoo's external API using secure credentials.

## 🛠️ Tech Stack

- **Frontend**: [Next.js 15+](https://nextjs.org/), [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Visuals**: [Framer Motion](https://www.framer.com/motion/) (Animations), [Recharts](https://recharts.org/) (Data Viz), [Lucide React](https://lucide.dev/) (Icons)
- **AI Engine**: [Groq Cloud](https://groq.com/) (Llama-3.3-70b-versatile)
- **ERP Connection**: [Odoo XML-RPC](https://www.odoo.com/documentation/17.0/developer/howto/api.html)

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/Seyfullah-KIZILKAYAA/erp_ai_cheatbot.git
cd erp_ai_cheatbot
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
# AI API
GROQ_API_KEY=your_groq_api_key

# Odoo Integration
ODOO_URL=http://your-odoo-instance.com
ODOO_DB=your_db_name
ODOO_USERNAME=your_username
ODOO_PASSWORD=your_api_key_or_password
```

### 4. Run the Application
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to start chatting with your ERP.

## 💡 How It Works (The "Brain")

1. **Intention Analysis**: The user sends a message (e.g., "What is the stock level of 'Tire'?").
2. **Schema Mapping**: The AI (Llama 3.3) uses its knowledge of Odoo's data structure to map the intent to specific models/fields.
3. **JSON Action Generation**: The AI generates a structured "Action JSON" (not raw SQL) that describes the Odoo domain filter and fields.
4. **XML-RPC Execution**: The backend translates the JSON into an Odoo XML-RPC call and fetches real-time data.
5. **Contextual Summary**: The AI receives the raw data, analyzes it, and provides a concise human explanation alongside the generated UI component.

## 📄 License

This project is open-source and available for educational purposes. Feel free to contribute!

