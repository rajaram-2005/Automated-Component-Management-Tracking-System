package com.arena.compoundmanagement.dto;

import com.arena.compoundmanagement.model.AuditLog;

import java.time.LocalDateTime;

public record AuditLogResponse(
        Long id,
        String username,
        AuditLog.AuditAction action,
        String entityType,
        String entityId,
        String summary,
        LocalDateTime timestamp
) {
    public static AuditLogResponse from(AuditLog log) {
        return new AuditLogResponse(
                log.getId(),
                log.getUsername(),
                log.getAction(),
                log.getEntityType(),
                log.getEntityId(),
                log.getSummary(),
                log.getOccurredAt());
    }
}
