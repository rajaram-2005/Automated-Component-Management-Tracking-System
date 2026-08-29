package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.model.EngineeringComponent;
import com.arena.compoundmanagement.model.EngineeringDomain;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RecommendationServiceTest {

    private final AnalyticsService analyticsService = new AnalyticsService();
    private final RecommendationService recommendationService =
            new RecommendationService(analyticsService, new SearchService(analyticsService));

    @Test
    void recommendsComplementaryComponentsForAnchor() {
        List<EngineeringComponent> components = List.of(
                component(1L, "ECE-LORA-L1M2N3", "LoRa SX1278 Transceiver Module",
                        EngineeringDomain.ECE, "Communication Modules", "Asia-Pacific"),
                component(2L, "ECE-IMU-S4T5U6", "MEMS IMU 9-DOF Sensor",
                        EngineeringDomain.ECE, "Sensors & Instrumentation", "Asia-Pacific"),
                component(3L, "MEC-BEAR-E1F2G3", "Deep Groove Ball Bearing 6204",
                        EngineeringDomain.MECHANICAL, "Bearings & Motion", "Europe")
        );

        RecommendationService.RecommendationOutcome outcome =
                recommendationService.recommendForComponent(components.get(0), components);

        assertFalse(outcome.matches().isEmpty());
        // The ECE IMU should be ranked above the unrelated mechanical bearing.
        EngineeringComponent top = outcome.matches().get(0).component();
        assertTrue(top.getId() == 2L);
    }

    @Test
    void producesEmptyRecommendationsForUnknownQuery() {
        List<EngineeringComponent> components = List.of(
                component(1L, "ECE-LORA-L1M2N3", "LoRa SX1278 Transceiver Module",
                        EngineeringDomain.ECE, "Communication Modules", "Asia-Pacific")
        );

        RecommendationService.RecommendationOutcome outcome =
                recommendationService.recommendForQuery("nothing matches this at all", components);

        assertTrue(outcome.matches().isEmpty());
    }

    private EngineeringComponent component(Long id,
                                           String code,
                                           String name,
                                           EngineeringDomain domain,
                                           String category,
                                           String region) {
        EngineeringComponent component = new EngineeringComponent();
        component.setId(id);
        component.setComponentCode(code);
        component.setName(name);
        component.setDiscipline(domain);
        component.setCategory(category);
        component.setRegion(region);
        component.setSubCategory("Sub");
        component.setManufacturer("Test Manufacturer");
        component.setSpecifications("Industrial component with standard specification");
        component.setQuantity(50);
        component.setMinimumStockLevel(10);
        component.setMonthlyDemand(5);
        component.setLeadTimeDays(10);
        component.setUnitPrice(20.0);
        component.setClassificationConfidence(80.0);
        return component;
    }
}
