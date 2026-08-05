package com.arena.compoundmanagement.dto;

import com.arena.compoundmanagement.model.EngineeringDomain;

import java.util.List;

public record ClassificationResponse(
        EngineeringDomain discipline,
        String category,
        double confidence,
        List<String> matchedSignals,
        String summary
) {
}
