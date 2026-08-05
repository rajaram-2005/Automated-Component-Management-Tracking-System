package com.arena.compoundmanagement.dto;

import java.util.List;

public record RecommendationResponse(
        String summary,
        List<RecommendationItem> recommendations
) {
}
