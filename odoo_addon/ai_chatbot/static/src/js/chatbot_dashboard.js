/** @odoo-module **/

import { registry } from "@web/core/registry";
const { Component } = owl;

class ChatbotDashboard extends Component { }
ChatbotDashboard.template = "ai_chatbot.ChatbotDashboard";

registry.category("actions").add("ai_chatbot_dashboard", ChatbotDashboard);
