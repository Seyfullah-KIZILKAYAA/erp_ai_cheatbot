# 🤖 ERP AI Chatbot

An intelligent ERP Assistant that allows you to query your business data using natural language. Built with Next.js, Supabase, and the ultra-fast Groq AI API.

![Project Status](https://img.shields.io/badge/Status-Active-success)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Supabase](https://img.shields.io/badge/Supabase-Database-green)
![Groq](https://img.shields.io/badge/AI-Groq%20(Llama%203.3)-orange)

## 🌟 Features

- **💬 Natural Language Querying**: Ask questions like "Who are my top customers?" or "Show me sales from last week" in plain Turkish (or English).
- **🚀 Ultra-Fast AI**: Powered by Groq's high-speed inference engine using the **Llama 3.3 70B** model.
- **🔄 Dynamic Schema Awareness**: The bot intelligently inspects your database schema to understand available tables and columns automatically.
- **🛡️ Secure Database Access**: Directly interacts with Supabase to fetch real-time data securely.
- **📊 Smart Summaries**: Automatically analyzes raw data and provides concise, human-readable summaries.

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Vanilla CSS (Modern & Responsive), Framer Motion (Animations), Lucide React (Icons)
- **Backend/Database**: Supabase (PostgreSQL)
- **AI/LLM**: Groq API (Llama-3.3-70b-versatile)

## 🚀 Getting Started

Follow these steps to set up the project locally.

### 1. Clone the repository
```bash
git clone https://github.com/Seyfullah-KIZILKAYAA/erp_ai_cheatbot.git
cd erp_ai_cheatbot
```

### 2. Install Dependencies
```bash
npm install
# or
yarn install
```

### 3. Environment Configuration
Create a `.env.local` file in the root directory and add your keys:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GROQ_API_KEY=your_groq_api_key
```

### 4. Database Setup
This project requires specific tables and functions in Supabase. Run the SQL scripts provided in the `sql/` folder (or root) in your Supabase SQL Editor:
- `setup.sql` (Creates base tables)
- `setup_schema_introspection.sql` (Enables the AI to read DB structure)
- `enable_all_read_access.sql` (Configures RLS policies)

### 5. Run the Application
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

## 💡 How It Works

1. **User asks a question**: "Lastik satışları ne durumda?"
2. **AI Analysis**: The system sends the schema + question to Llama 3.3 (via Groq).
3. **Query Generation**: The AI generates a structured JSON query object instead of raw SQL code for safety.
4. **Execution**: The server executes the query against Supabase.
5. **Response**: The AI reads the data and formulates a helpful conversational response.

## 📄 License

This project is open-source and available for educational purposes.
