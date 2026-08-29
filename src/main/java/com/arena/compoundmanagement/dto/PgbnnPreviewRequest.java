package com.arena.compoundmanagement.dto;

import com.arena.compoundmanagement.model.EngineeringDomain;

/**
 * Draft payload for PG-BNN preview while the wizard form is still being
 * filled — every field is optional so partial drafts can be analysed.
 */
public record PgbnnPreviewRequest(
        String name,
        String specifications,
        String category,
        String subCategory,
        String region,
        EngineeringDomain discipline,
        Integer quantity,
        Integer minimumStockLevel,
        Double monthlyDemand,
        Integer leadTimeDays,
        Double unitPrice
) {
}
