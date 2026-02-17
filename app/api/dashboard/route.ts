
import { NextResponse } from "next/server";
import { countData, getTables } from "@/lib/dataAccess";
import { getKpiSummary } from "@/lib/erpoClient";

export async function GET() {
    try {
        console.log("Dashboard API: Fetching stats...");

        // Parallel requests for speed — Odoo + ERPO
        const [customerCount, orderCount, productCount, quotationCount, erpoData] = await Promise.all([
            countData(getTables().customers, [['active', '=', true]]),
            countData(getTables().salesOrders, [['state', '=', 'sale']]),
            countData(getTables().products, [['active', '=', true]]),
            countData(getTables().salesOrders, [['state', '=', 'draft']]),
            getKpiSummary().catch(() => null)
        ]);

        const erpoConnected = erpoData !== null;

        return NextResponse.json({
            customers: customerCount,
            orders: orderCount,
            products: productCount,
            quotations: quotationCount,
            // ERPO ML KPIs (null if ERPO is offline)
            erpo: erpoConnected ? {
                connected: true,
                total_revenue: erpoData.total_revenue,
                anomaly_count: erpoData.anomaly_count,
                avg_order_value: erpoData.avg_order_value,
                mom_growth_pct: erpoData.mom_growth_pct,
                active_customers: erpoData.active_customers,
            } : {
                connected: false,
            }
        });

    } catch (error: unknown) {
        console.error("Dashboard API Error:", error);
        return NextResponse.json({ error: "Veri çekilemedi" }, { status: 500 });
    }
}
