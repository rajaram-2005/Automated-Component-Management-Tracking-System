package com.arena.compoundmanagement.dto;

import java.util.List;

/**
 * PG-BNN uncertainty analysis for one catalogued component: the deterministic
 * inventory physics (prior), the neural ensemble (likelihood), and their
 * conjugate-Gaussian posterior with a 90% credible band.
 */
public record PgbnnForecastResponse(
        long componentId,
        String name,
        String componentCode,
        String discipline,
        double priorDays,
        double neuralMeanDays,
        double sigmaDays,
        double posteriorDays,
        double lowerDays,
        double upperDays,
        double agreementPercent,
        String risk,
        String narrative,
        boolean neuralActive,
        List<Double> memberDays
) {
}
