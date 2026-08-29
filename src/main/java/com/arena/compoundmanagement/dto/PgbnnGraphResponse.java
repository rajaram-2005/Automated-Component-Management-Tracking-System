package com.arena.compoundmanagement.dto;

import java.util.List;

public record PgbnnGraphResponse(
        List<NodeView> nodes,
        List<EdgeView> edges
) {
    public record NodeView(
            long id,
            String name,
            String componentCode,
            String discipline,
            String stockRisk,
            int quantity,
            int degree
    ) {
    }

    public record EdgeView(
            long source,
            long target,
            double weight
    ) {
    }
}
