package com.arena.compoundmanagement.dto;

import com.arena.compoundmanagement.model.StockRisk;

import java.util.List;
import java.util.Map;

public record AnalyticsOverviewResponse(
        int totalComponents,
        int totalUnits,
        long lowStockComponents,
        long predictedShortagesThisMonth,
        double averageAvailabilityProbability,
        Map<String, Long> domainDistribution,
        Map<String, Long> regionDistribution,
        List<RiskItem> atRiskComponents,
        List<String> keyInsights
) {
    public record RiskItem(
            Long id,
            String componentCode,
            String name,
            String discipline,
            double predictedDaysToStockout,
            double availabilityProbability,
            StockRisk stockRisk
    ) {
    }
}
