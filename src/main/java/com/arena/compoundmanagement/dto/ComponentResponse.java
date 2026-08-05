package com.arena.compoundmanagement.dto;

import com.arena.compoundmanagement.model.EngineeringDomain;
import com.arena.compoundmanagement.model.StockRisk;

import java.time.LocalDateTime;

public record ComponentResponse(
        Long id,
        String componentCode,
        String name,
        EngineeringDomain discipline,
        String category,
        String subCategory,
        String region,
        String manufacturer,
        String specifications,
        int quantity,
        int minimumStockLevel,
        double monthlyDemand,
        int leadTimeDays,
        double unitPrice,
        double classificationConfidence,
        double predictedDaysToStockout,
        double availabilityProbability,
        StockRisk stockRisk,
        String analyticsNarrative,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
