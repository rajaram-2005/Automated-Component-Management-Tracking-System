package com.arena.compoundmanagement.controller;

import com.arena.compoundmanagement.dto.AuditLogResponse;
import com.arena.compoundmanagement.service.AuditLogService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/audit")
public class AuditLogController {

    private final AuditLogService auditLogService;

    public AuditLogController(AuditLogService auditLogService) {
        this.auditLogService = auditLogService;
    }

    @GetMapping("/recent")
    public List<AuditLogResponse> recent(@RequestParam(value = "limit", defaultValue = "20") int limit) {
        return auditLogService.recent(limit);
    }
}
