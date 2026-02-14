# Multi-Agent Collaboration Test Scenarios

This document outlines test scenarios to verify that the multi-agent orchestrator correctly routes queries to appropriate agents and handles collaboration effectively.

## Test Overview

The system uses 6 specialized agents:
- **Sales Agent**: Customer data, sales orders, quotations
- **Finance Agent**: Invoices, payments, financial KPIs
- **Inventory Agent**: Stock levels, products, warehouse data
- **Purchasing Agent**: Purchase orders, vendors, procurement
- **HR Agent**: Employees, attendance, leave management
- **CRM Agent**: Leads, opportunities, sales pipeline

---

## Test 1: Cross-Department Financial-Sales Query

**Query:** `"Bugün onaylanan faturaların müşterilerini listele"`

**Expected Behavior:**
- **Agents Called**: Finance Agent + Sales Agent
- **Finance Agent**: Retrieves invoices with `state='posted'` and `invoice_date=today`
- **Sales Agent**: Retrieves customer (`res.partner`) details for those invoices
- **Result**: Both agents should execute in parallel, data merged in response

**Verification:**
- Open browser console and check for log entries from both agents
- Verify the response includes invoice data and customer information
- Confirm no unnecessary agents were called (Inventory, Purchasing, HR, CRM should NOT be invoked)

---

## Test 2: Inventory-Purchasing Chain

**Query:** `"Stokta az olan ürünler için bekleyen satın alma siparişlerini göster"`

**Expected Behavior:**
- **Agents Called**: Inventory Agent + Purchasing Agent
- **Inventory Agent**: Finds products with `qty_available < 10` (critical stock level)
- **Purchasing Agent**: Retrieves pending purchase orders (`state='purchase'`)
- **Result**: Cross-referenced data showing low-stock products and their pending orders

**Verification:**
- Console logs should show both Inventory and Purchasing agents executing
- Response should identify critical stock items
- Purchasing data should correlate with inventory needs
- No Sales/Finance/HR/CRM agents should be triggered

---

## Test 3: HR-Sales Performance Correlation

**Query:** `"Satış departmanındaki çalışanları ve bugünkü satış siparişlerini özetle"`

**Expected Behavior:**
- **Agents Called**: HR Agent + Sales Agent
- **HR Agent**: Retrieves employees filtered by `department_id` containing "Satış" or "Sales"
- **Sales Agent**: Retrieves sales orders for today (`date_order=today`)
- **Result**: Employee list and sales performance data presented together

**Verification:**
- Both HR and Sales agents should execute
- Console should log department filtering logic
- Response should show employee count and sales order summary
- Verify correct department-based employee filtering

---

## Test 4: Single Agent Verification (No Unnecessary Calls)

**Query:** `"Tüm müşterileri listele"`

**Expected Behavior:**
- **Agent Called**: Sales Agent ONLY
- **Routing**: Orchestrator should recognize this as a sales-specific query
- **Result**: Customer list from `res.partner` table, no multi-agent overhead

**Verification:**
- Console should show ONLY Sales Agent execution
- No Finance, Inventory, Purchasing, HR, or CRM agents should be invoked
- Response metadata should indicate `multi_agent: false`
- Confidence score should be high (>= 80%)

---

## Test 5: CRM-Sales Distinction

**Query:** `"Açık CRM fırsatlarını göster"`

**Expected Behavior:**
- **Agent Called**: CRM Agent ONLY
- **Routing**: Keyword "CRM fırsatları" should trigger CRM agent, NOT Sales agent
- **Filter**: `probability > 0` for active opportunities
- **Result**: List of active CRM leads/opportunities

**Verification:**
- Console should show ONLY CRM Agent execution
- Sales Agent should NOT be called (verify no "💼 SALES AGENT" log)
- Response should show opportunities with probability scores
- Orchestrator analysis should mention "CRM" explicitly

---

## Test 6: Executive Summary (Multi-Agent Collaboration)

**Query:** `"Şirket özetini çıkar"` or `"Şirket özeti"`

**Expected Behavior:**
- **Agents Called**: Sales + Finance + Inventory + Purchasing + CRM (5 agents in parallel)
- **Routing**: Rule-based override forces all business-critical agents to execute
- **Result**: Comprehensive executive summary with KPIs from all departments

**Verification:**
- Console should show all 5 agents executing in parallel
- Response should have multi-part structure with headers for each department
- Verify `multi_agent: true` in metadata
- Check for orchestrator analysis header "📊 Yönetici Özeti"
- All agent responses should be merged into a single cohesive summary

---

## Test 7: Error Resilience (Partial Failure)

**Query:** `"Tüm departmanlardan bugünkü verileri göster"`

**Scenario:** Simulate failure in one agent (e.g., Finance Agent timeout)

**Expected Behavior:**
- **Promise.allSettled** should allow other agents to succeed
- **Failed Agent**: Should show error message but NOT crash the entire request
- **Successful Agents**: Should return their data normally

**Verification:**
- Temporarily add a `throw new Error("Test failure")` to Finance Agent
- Execute the query and verify other agents still return data
- Console should log the Finance Agent error
- Response should show "⚠️ Bir agent yanıt veremedi, ancak diğer veriler gösteriliyor."
- Remove the test error after verification

---

## Test 8: Orchestrator Fallback

**Query:** `"Merhaba, nasılsın?"` (Non-business query)

**Expected Behavior:**
- **Agent Called**: Sales Agent (default fallback)
- **Routing**: Orchestrator cannot determine intent, defaults to Sales
- **Result**: Generic response or "No data found" message

**Verification:**
- Console should show orchestrator analysis indicating low confidence
- Sales Agent should be called as fallback
- Response should be polite but indicate limited capability for conversational queries

---

## Test 9: Timeout Handling

**Query:** `"Tüm ürünleri listele"` (Large dataset)

**Scenario:** Query that might take longer than 12 seconds

**Expected Behavior:**
- **Timeout**: If Inventory Agent exceeds 12s, should throw timeout error
- **Retry**: Should attempt up to 2 retries with exponential backoff
- **Result**: Either succeed after retry or fail gracefully with timeout message

**Verification:**
- Monitor console for retry attempt logs: `"Retry attempt 1/2 after Xms delay"`
- If all retries fail, verify timeout error message is clear
- No server crash or unhandled promise rejection

---

## Test 10: Concurrent Multi-Table Query

**Query:** `"Satış siparişleri ve stok durumunu birlikte göster"`

**Expected Behavior:**
- **Agents Called**: Sales Agent + Inventory Agent
- **Sales Agent**: Queries `sale.order` table
- **Inventory Agent**: Queries `product.product` table
- **Result**: Both datasets presented in unified response

**Verification:**
- Both agents should execute in parallel (check timestamps in console logs)
- Response should merge sales order list and product stock levels
- Verify data integrity (correct table fields returned)
- No data mixing or cross-contamination between agent results

---

## Testing Process

1. **Setup**: Start development server with `npm run dev`
2. **Open Browser Console**: Navigate to `http://localhost:3000` and open DevTools
3. **Execute Each Test**: Enter the query in the chat interface
4. **Monitor Console**: Check for agent execution logs and orchestrator routing decisions
5. **Verify Response**: Ensure data quality, accuracy, and appropriate agent selection
6. **Document Results**: Note any routing errors, data inconsistencies, or unexpected behavior

---

## Success Criteria

- ✅ All single-agent queries route to exactly one agent
- ✅ Multi-agent queries execute all relevant agents in parallel
- ✅ No unnecessary agents are called for specific queries
- ✅ Orchestrator confidence scores are accurate (>= 80% for clear intents)
- ✅ CRM vs Sales distinction works correctly
- ✅ Executive summary triggers all 5 business agents
- ✅ Partial failures do not crash the entire request (Promise.allSettled)
- ✅ Timeout and retry mechanisms work as expected
- ✅ Data from multiple agents is merged coherently in the response

---

## Known Issues / Edge Cases

- **Empty Results**: If Odoo database has no data for a query, agents return "No data found" - this is expected
- **Purchasing Agent State Filter**: May return empty if no purchase orders have `state='purchase'` in the database
- **CRM Opportunities**: Requires `probability > 0` filter, empty result is normal if no active opportunities exist

---

## Future Enhancements

- Automated test suite using Jest/Vitest
- Agent collaboration metrics dashboard
- Synthetic test data generator for Odoo
- Performance benchmarking for multi-agent queries
- Agent-to-agent data sharing (e.g., Inventory tells Purchasing which products need restocking)
