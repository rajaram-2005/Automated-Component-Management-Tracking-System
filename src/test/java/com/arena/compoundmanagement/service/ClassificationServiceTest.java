package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.model.EngineeringDomain;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ClassificationServiceTest {

    private final ClassificationService classificationService = new ClassificationService();

    @Test
    void classifiesEmbeddedControllerAsEce() {
        ClassificationService.ClassificationOutcome outcome = classificationService.classify(
                "ESP32 Development Module",
                "Wi-Fi Bluetooth microcontroller with UART, SPI and IoT support",
                "embedded"
        );

        assertEquals(EngineeringDomain.ECE, outcome.discipline());
        assertEquals("Embedded & IoT Controllers", outcome.category());
        assertTrue(outcome.confidence() > 50.0);
    }

    @Test
    void classifiesBearingAsMechanical() {
        ClassificationService.ClassificationOutcome outcome = classificationService.classify(
                "Deep Groove Bearing 6204",
                "Low friction sealed rotary bearing for shaft motion",
                null
        );

        assertEquals(EngineeringDomain.MECHANICAL, outcome.discipline());
        assertEquals("Bearings & Motion", outcome.category());
    }
}
