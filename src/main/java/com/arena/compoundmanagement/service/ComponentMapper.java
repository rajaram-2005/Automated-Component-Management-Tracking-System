package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.dto.ComponentResponse;
import com.arena.compoundmanagement.model.EngineeringComponent;
import org.springframework.stereotype.Component;

@Component
public class ComponentMapper {

    private final AnalyticsService analyticsService;

    public ComponentMapper(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    public ComponentResponse toResponse(EngineeringComponent component) {
        AnalyticsService.ComponentForecast forecast = analyticsService.forecast(component);
        return new ComponentResponse(
                component.getId(),
                component.getComponentCode(),
                component.getName(),
                component.getDiscipline(),
                component.getCategory(),
                component.getSubCategory(),
                component.getRegion(),
                component.getManufacturer(),
                component.getSpecifications(),
                component.getQuantity(),
                component.getMinimumStockLevel(),
                component.getMonthlyDemand(),
                component.getLeadTimeDays(),
                component.getUnitPrice(),
                component.getClassificationConfidence(),
                forecast.predictedDaysToStockout(),
                forecast.availabilityProbability(),
                forecast.stockRisk(),
                forecast.narrative(),
                component.getCreatedAt(),
                component.getUpdatedAt());
    }
}
