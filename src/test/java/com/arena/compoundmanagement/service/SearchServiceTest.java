package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.model.EngineeringComponent;
import com.arena.compoundmanagement.model.EngineeringDomain;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SearchServiceTest {

    private final SearchService searchService = new SearchService(new AnalyticsService());

    @Test
    void findsMechanicalBearingForNaturalLanguageQuery() {
        List<EngineeringComponent> components = List.of(
                component(1L, "MEC-BEAR-E1F2G3", "Deep Groove Ball Bearing 6204",
                        EngineeringDomain.MECHANICAL, "Bearings & Motion", "Europe", 120, 40, 12, 6.2),
                component(2L, "ECE-LORA-L1M2N3", "LoRa SX1278 Transceiver Module",
                        EngineeringDomain.ECE, "Communication Modules", "Asia-Pacific", 41, 15, 18, 7.4),
                component(3L, "EEE-IGBT-P4D5E6", "3-Phase IGBT Power Module",
                        EngineeringDomain.EEE, "Power Electronics", "Europe", 14, 12, 35, 48.0)
        );

        SearchService.SearchOutcome outcome = searchService.search("find mechanical bearings", components);

        assertFalse(outcome.matches().isEmpty());
        assertEquals(EngineeringDomain.MECHANICAL, outcome.matches().get(0).component().getDiscipline());
    }

    @Test
    void parsesLowStockFocusIntent() {
        List<EngineeringComponent> components = List.of(
                component(1L, "MEC-BEAR-E1F2G3", "Deep Groove Ball Bearing 6204",
                        EngineeringDomain.MECHANICAL, "Bearings & Motion", "Europe", 3, 40, 12, 6.2)
        );

        SearchService.SearchOutcome outcome = searchService.search("low stock bearings", components);

        assertFalse(outcome.matches().isEmpty());
        assertTrue(outcome.interpretedIntent().contains("low-stock"));
    }

    private EngineeringComponent component(Long id,
                                           String code,
                                           String name,
                                           EngineeringDomain domain,
                                           String category,
                                           String region,
                                           int quantity,
                                           int minStock,
                                           int leadTime,
                                           double unitPrice) {
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
        component.setQuantity(quantity);
        component.setMinimumStockLevel(minStock);
        component.setMonthlyDemand(5);
        component.setLeadTimeDays(leadTime);
        component.setUnitPrice(unitPrice);
        component.setClassificationConfidence(80.0);
        return component;
    }
}
