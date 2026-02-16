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
        console.error("ERPO GET Error:", error);
        return NextResponse.json(
            { connected: false, kpi: null, error: 'Servis baglantisi kurulamadi' },
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
        console.error("ERPO POST Error:", error);
        const isConnectionError = error.message?.includes("ECONNREFUSED") ||
            error.message?.includes("fetch failed") ||
            error.message?.includes("timed out") ||
            error.message?.includes("Authentication failed");

        return NextResponse.json(
            {
                error: isConnectionError
                    ? "ERP sistemine baglanamıyor. Lutfen servisin calistigindan emin olun."
                    : "Rapor uretilemedi. Lutfen tekrar deneyin."
            },
            { status: isConnectionError ? 503 : 500 }
        );
    }
}
