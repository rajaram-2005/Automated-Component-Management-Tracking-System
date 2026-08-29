package com.arena.compoundmanagement.dto;

import java.time.Instant;
import java.util.List;

public record PgbnnHealthResponse(
        int ensembleSize,
        int hiddenNeurons,
        int inputFeatures,
        int parameters,
        int epochs,
        double finalLoss,
        long trainMillis,
        int graphNodes,
        int graphEdges,
        Instant trainedAt,
        String status,
        List<Double> lossCurve
) {
}
