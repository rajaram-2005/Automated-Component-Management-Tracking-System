package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.model.EngineeringComponent;
import com.arena.compoundmanagement.model.EngineeringDomain;
import com.arena.compoundmanagement.model.StockRisk;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AnalyticsServiceTest {

    private final AnalyticsService analyticsService = new AnalyticsService();

    @Test
    void forecastsCriticalRiskWhenStockoutIsInsideLeadTime() {
        EngineeringComponent component = new EngineeringComponent();
        component.setName("Critical IGBT Module");
        component.setComponentCode("EEE-TEST-001");
        component.setDiscipline(EngineeringDomain.EEE);
        component.setCategory("Power Electronics");
        component.setRegion("Europe");
        component.setQuantity(5);
        component.setMinimumStockLevel(12);
        component.setMonthlyDemand(10);
        component.setLeadTimeDays(30);
        component.setUnitPrice(55.0);
        component.setClassificationConfidence(87.0);

        AnalyticsService.ComponentForecast forecast = analyticsService.forecast(component);

        assertEquals(StockRisk.CRITICAL, forecast.stockRisk());
        assertTrue(forecast.predictedDaysToStockout() <= 30);
    }
}
