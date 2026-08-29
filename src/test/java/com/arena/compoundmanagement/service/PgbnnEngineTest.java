package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.model.EngineeringComponent;
import com.arena.compoundmanagement.model.EngineeringDomain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PgbnnEngineTest {

    private final PgbnnEngine engine = new PgbnnEngine(4, 16, 120);

    private static EngineeringComponent component(long id, String name, String specs, EngineeringDomain domain,
                                                   String region, int qty, int min, double demand, int lead) {
        EngineeringComponent c = new EngineeringComponent();
        c.setId(id);
        c.setComponentCode("T-" + id);
        c.setName(name);
        c.setSpecifications(specs);
        c.setDiscipline(domain);
        c.setCategory("Test Category");
        c.setRegion(region);
        c.setQuantity(qty);
        c.setMinimumStockLevel(min);
        c.setMonthlyDemand(demand);
        c.setLeadTimeDays(lead);
        c.setUnitPrice(5.0);
        return c;
    }

    private List<EngineeringComponent> catalog() {
        return List.of(
                component(1, "LoRa SX1278 Transceiver", "433MHz RF telemetry SPI low-power", EngineeringDomain.ECE,
                        "Asia-Pacific", 40, 15, 10, 20),
                component(2, "IGBT Power Module", "600V 50A inverter switching motor drive", EngineeringDomain.EEE,
                        "Europe", 12, 10, 6, 30),
                component(3, "Ball Bearing 6204", "20mm ID 47mm OD sealed rotary steel", EngineeringDomain.MECHANICAL,
                        "Europe", 100, 30, 20, 10),
                component(4, "ESP32 Wireless MCU", "dual-core Wi-Fi Bluetooth microcontroller", EngineeringDomain.ECE,
                        "Asia-Pacific", 70, 20, 15, 14),
                component(5, "Pneumatic Cylinder", "double acting 32mm bore 100mm stroke", EngineeringDomain.MECHANICAL,
                        "North America", 9, 8, 4, 25),
                component(6, "BLDC Motor Driver", "48V 30A field oriented control current feedback", EngineeringDomain.EEE,
                        "Asia-Pacific", 16, 8, 5, 28)
        );
    }

    @BeforeEach
    void train() {
        engine.train(catalog());
    }

    @Test
    void classificationPosteriorsFormAProbabilityDistribution() {
        var cls = engine.classify(catalog().get(0));
        double sum = 0;
        for (double p : cls.probabilities()) {
            assertTrue(p >= 0 && p <= 1, "probability out of range: " + p);
            sum += p;
        }
        assertEquals(1.0, sum, 0.01);
    }

    @Test
    void classificationConfidenceExceedsBlindGuess() {
        var cls = engine.classify(catalog().get(0));
        assertTrue(cls.topPercent() > 33.4, "posterior too flat after training: " + cls.topPercent());
    }

    @Test
    void forecastBandsAreOrderedAndFinite() {
        for (EngineeringComponent c : catalog()) {
            var f = engine.forecast(c);
            assertTrue(f.neuralActive());
            assertTrue(f.lowerDays() <= f.posteriorDays(), "lower band above posterior");
            assertTrue(f.posteriorDays() <= f.upperDays() + 0.01, "posterior above upper band");
            assertTrue(Double.isFinite(f.sigmaDays()) && f.sigmaDays() >= 0);
            assertEquals(f.memberDays().size(), 4);
        }
    }

    @Test
    void scarcerStockYieldsShorterPosteriorHorizon() {
        var healthy = engine.forecast(component(7, "Test Sensor", "digital sensor", EngineeringDomain.ECE,
                "Europe", 500, 10, 5, 10));
        var scarce = engine.forecast(component(8, "Test Sensor", "digital sensor", EngineeringDomain.ECE,
                "Europe", 4, 10, 5, 10));
        assertTrue(scarce.posteriorDays() < healthy.posteriorDays(),
                "scarce stock should deplete sooner: " + scarce.posteriorDays() + " vs " + healthy.posteriorDays());
        assertTrue(scarce.lowerDays() <= scarce.upperDays());
    }

    @Test
    void graphIsSymmetricAndWeightBounded() {
        var graph = engine.graph();
        for (var edge : graph.edges()) {
            assertTrue(graph.nodeIds().contains(edge.source()));
            assertTrue(graph.nodeIds().contains(edge.target()));
            assertTrue(edge.weight() >= 0.3 && edge.weight() <= 1.0, "bad edge weight " + edge.weight());
        }
        long mirrored = graph.edges().stream()
                .filter(e -> graph.edges().stream().anyMatch(r -> r.source() == e.target() && r.target() == e.source()))
                .count();
        assertEquals(0, mirrored, "undirected graph must not store mirrored edges");
    }

    @Test
    void retrainingIsDeterministicForSameCatalog() {
        PgbnnEngine first = new PgbnnEngine(4, 16, 120);
        PgbnnEngine second = new PgbnnEngine(4, 16, 120);
        first.train(catalog());
        second.train(catalog());
        assertEquals(first.health().finalLoss(), second.health().finalLoss(), 1e-9);
        assertEquals(first.health().graphEdges(), second.health().graphEdges());
    }

    @Test
    void engineDegradesGracefullyWithoutTraining() {
        PgbnnEngine cold = new PgbnnEngine();
        assertEquals("untrained", cold.health().status());
        var f = cold.forecast(catalog().get(0));
        assertFalse(f.neuralActive());
        assertTrue(f.upperDays() >= f.priorDays(), "untrained fallback must stay wide and safe");
    }
}
