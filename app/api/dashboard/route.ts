
import { NextResponse } from "next/server";
import { countOdoo } from "@/lib/odooClient";

export async function GET() {
    try {
        console.log("Dashboard API: Fetching stats...");

        // Parallel requests for speed
        const [customerCount, orderCount, productCount, quotationCount] = await Promise.all([
            countOdoo('res.partner', [['active', '=', true]]), // Active Customers
            countOdoo('sale.order', [['state', '=', 'sale']]), // Confirmed Sales
            countOdoo('product.product', [['active', '=', true]]), // Active Products
            countOdoo('sale.order', [['state', '=', 'draft']]) // Draft Quotations
        ]);

        return NextResponse.json({
            customers: customerCount,
            orders: orderCount,
            products: productCount,
            quotations: quotationCount
        });

    } catch (error: any) {
        console.error("Dashboard API Error:", error);
        return NextResponse.json({ error: "Veri çekilemedi" }, { status: 500 });
    }
}
