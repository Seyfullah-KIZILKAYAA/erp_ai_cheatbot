# 🤖 ERP AI Chatbot - Advanced Multi-Agent Intelligence System

![ERP AI Chatbot Architecture](./multi_agent_architecture2.png)

## 🚀 Overview

**ERP AI Chatbot** is a state-of-the-art, multi-agent artificial intelligence ecosystem designed to bridge the gap between complex ERP data and natural language interaction. Built primarily for **Odoo ERP**, it transforms your business management experience by providing a conversational interface that doesn't just answer questions—it analyzes, reasons, writes records, and reports like a professional management team.

By leveraging the **Llama 3.3 70B** model via high-speed **Groq** inference, the system achieves near-instant response times with deep domain expertise across various business functions.

---

## 🧠 The Orchestrator: Central Intelligence

The core of the system is the **Orchestrator Agent**. Unlike traditional chatbots that use a single prompt for everything, our Orchestrator performs a **Preliminary Brain Analysis** on every user request:

1.  **Intent Recognition**: Identifies the primary goal of the user.
2.  **Domain Mapping**: Determines which specialized departments (Agents) are needed.
3.  **Confidence Scoring**: Weights the reliability of its decision (0-100%).
4.  **Parallel Dispatch**: If a query is multi-disciplinary (e.g., "Check stock for our best-selling items"), it triggers multiple agents simultaneously.

---

## 🛡️ Meet the Specialized Agents

The system features **7 autonomous agents**, each specialized in a specific business vertical with tailored system prompts and Odoo table access:

### 📈 CRM Agent (Customer Relations)
*   **Focus**: Leads, Opportunities, Pipelines, and Conversion Rates.
*   **Read**: Tracks the sales funnel, identifies high-probability deals, and reports on customer touchpoints.
*   **Write**: Create new CRM leads/opportunities, update lead details (stage, expected revenue, customer).

### 👥 HR Agent (Human Resources)
*   **Focus**: Employee records, Attendance, Leaves, and HR Metrics.
*   **Read**: Summarizes headcount, tracks daily absences, and provides department-based personnel distribution.
*   **Write**: Create new employees, update employee info (company, department, position, contact).

### 🧾 Purchasing Agent (Procurement)
*   **Focus**: Purchase Orders (PO), Vendors, and Item Procurement.
*   **Read**: Monitors pending approvals, evaluates vendor performance, and tracks upcoming material arrivals.
*   **Write**: Create new purchase orders, update PO details (vendor).

### 💰 Finance Agent (Accounting)
*   **Focus**: Invoices, Payments, Cash Flow, and AR/AP.
*   **Read**: Analyzes unpaid invoices, summarizes bank positions, and provides high-level financial health reports.
*   **Write**: Create new invoices, update invoice details (customer).

### 📦 Inventory Agent (Warehouse)
*   **Focus**: Stock Levels, Product Movements, and Replenishment.
*   **Read**: Identifies "Critical Stockout" risks, monitors warehouse transfers, and provides individual product availability.
*   **Write**: Create new products, update product info (price, code, name).

### 💼 Sales Agent (Commerce)
*   **Focus**: Quotations, Sales Orders, Revenue, and Customers.
*   **Read**: Calculates monthly revenue trends, lists top-performing products, and manages customer relationships.
*   **Write**: Create customers/orders, confirm orders, update customer info (email, phone, city).

### 🔬 Analytics Agent (ERPO Platform)
*   **Focus**: Advanced AI-powered analytics, forecasting, anomaly detection, and customer segmentation.
*   **Actions**: Time-series forecasting with Prophet, anomaly detection with Isolation Forest, RFM-based customer segmentation with K-Means, daily executive reports.

---

## ✍️ Write Confirmation System

All write operations (create & update) go through a **two-step confirmation flow** to prevent accidental data changes:

```
User Request → Agent extracts data → Missing field check
  → [Missing fields?] "These fields are empty, continue?" + Yes/No buttons
  → [Yes] Preview table: All fields displayed + "Save?" + Yes/No buttons
  → [Yes] Execute write to Odoo → Success message with result table
```

**Key Features:**
- **Inline confirmation cards** inside the chat with field tables (Field / Value / Status columns)
- **Color-coded status indicators**: Green (filled), Yellow (optional-missing), Red (required-missing)
- **Stateless architecture**: Pending write data embedded in message payload (no server-side state, serverless-compatible)
- **Write toggle**: Enable/disable all write operations from the Settings panel

---

## ✨ Key Technical Features

- **🔍 Chain of Thought (CoT) UI**: Witness the AI's internal reasoning process step-by-step.
- **📊 Interactive Dashboards**: Real-time data visualization using Recharts.
- **⚡ Ultra-Low Latency**: Powered by Groq's LPU (Language Processing Unit) for sub-second analysis.
- **📥 Enterprise Export**: One-click professional report generation in **PDF** or **Excel (XLSX)**.
- **🔒 Enterprise Security**: Secure XML-RPC protocol for direct Odoo integration without middleware data storage.
- **✍️ Two-Step Write Confirmation**: Safe create & update operations with preview and approval flow.
- **🧠 Session Memory**: Entity-aware context that remembers previously mentioned records.
- **⚙️ Settings Panel**: Dark mode, write toggle, and user preferences.
- **🛡️ Rate Limiting**: Built-in request throttling (20 req/min per session).
- **🔄 Graceful Degradation**: `Promise.allSettled` for partial success in multi-agent workflows.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript |
| **Styling** | CSS Modules, Twilight Royal Blue theme |
| **AI Models** | Llama 3.3 70B (Orchestration & Specialized Analysis) |
| **Inference** | Groq API |
| **CRM/ERP** | Odoo XML-RPC API |
| **Reports** | jsPDF, Recharts, XLSX |
| **Analytics** | Prophet (Forecasting), Isolation Forest (Anomaly), K-Means (Segmentation) |

---

## 🚀 Installation & Setup

### 1. Prerequisites
- Node.js 18+ and npm
- A running Odoo Instance (or Odoo SH/Online)
- Groq API Key

### 2. Clone the Repository
```bash
git clone https://github.com/Seyfullah-KIZILKAYAA/erp_ai_cheatbot.git
cd erp_ai_cheatbot
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment
Create a `.env.local` file in the root directory:
```env
# Groq API Configuration
GROQ_API_KEY=gsk_your_key_here

# Odoo Connection Details
ODOO_URL=https://your-company.odoo.com
ODOO_DB=database_name
ODOO_USERNAME=user_email
ODOO_PASSWORD=api_key_or_password
```

### 5. Start Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 📈 Roadmap

- [x] **Multi-Agent Collaboration**: Agents work in parallel for cross-departmental queries.
- [x] **Write Operations with Confirmation**: Create & update records across all modules with two-step approval.
- [x] **ERPO Analytics Platform**: Advanced forecasting, anomaly detection, and customer segmentation.
- [ ] **Voice Interaction**: Integration with Whisper for voice-to-command functionality.
- [ ] **Custom Agent Creation Tool**: A UI to build your own specialized agents for custom Odoo modules.
- [ ] **Webhook & Notification System**: Real-time alerts for critical ERP events.

---

## 🤝 Contribution

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---
**Maintained by:** [Seyfullah KIZILKAYA](https://github.com/Seyfullah-KIZILKAYAA)
