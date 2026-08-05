package com.arena.compoundmanagement.dto;

public record ClassificationRequest(
        String name,
        String specifications,
        String categoryHint
) {
}
