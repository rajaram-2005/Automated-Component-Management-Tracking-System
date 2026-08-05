package com.arena.compoundmanagement.dto;

import java.util.List;

public record SearchResultItem(
        ComponentResponse component,
        double score,
        List<String> reasons
) {
}
