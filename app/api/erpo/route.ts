/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import {
    getKpiSummary,
    getDailyReport,
    getAnomalyReport,
    getForecastReport,
    checkErpoHealth,
} from "@/lib/erpoClient";

export async function GET() {
    try {
        const [healthy, kpi] = await Promise.allSettled([
            checkErpoHealth(),
            getKpiSummary(),
        ]);

        const isHealthy = healthy.status === "fulfilled" && healthy.value;
        const kpiData = kpi.status === "fulfilled" ? kpi.value : null;

        return NextResponse.json({
            connected: isHealthy,
            kpi: kpiData,
        });
    } catch (error: any) {
        return NextResponse.json(
            { connected: false, kpi: null, error: error.message },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const { type } = await req.json();

        let report;
        switch (type) {
            case "daily-report":
                report = await getDailyReport();
                break;
            case "anomaly-report":
                report = await getAnomalyReport();
                break;
            case "forecast-report":
                report = await getForecastReport();
                break;
            default:
                return NextResponse.json(
                    { error: "Geçersiz rapor tipi" },
                    { status: 400 }
                );
        }

        return NextResponse.json(report);
    } catch (error: any) {
        const isConnectionError = error.message?.includes("ECONNREFUSED") ||
            error.message?.includes("fetch failed") ||
            error.message?.includes("timed out") ||
            error.message?.includes("Authentication failed");

        return NextResponse.json(
            {
                error: isConnectionError
                    ? "Odoo ERP sistemine bağlanılamıyor. Lütfen Odoo servisinin (localhost:8069) çalıştığından emin olun."
                    : "Rapor üretilemedi: " + error.message
            },
            { status: isConnectionError ? 503 : 500 }
        );
    }
}
