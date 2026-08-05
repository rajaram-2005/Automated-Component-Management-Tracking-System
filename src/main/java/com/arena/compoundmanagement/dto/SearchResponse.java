package com.arena.compoundmanagement.dto;

import java.util.List;

public record SearchResponse(
        String query,
        String interpretedIntent,
        List<SearchResultItem> results
) {
}
