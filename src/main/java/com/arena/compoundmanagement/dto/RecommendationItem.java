package com.arena.compoundmanagement.dto;

import java.util.List;

public record RecommendationItem(
        ComponentResponse component,
        double score,
        List<String> reasons
) {
}
