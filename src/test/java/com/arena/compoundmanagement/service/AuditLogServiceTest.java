package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.dto.AuditLogResponse;
import com.arena.compoundmanagement.model.AuditLog;
import com.arena.compoundmanagement.repository.AuditLogRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuditLogServiceTest {

    @Mock
    private AuditLogRepository auditLogRepository;

    @Test
    void recentMapsAuditEntriesAndClampsLimit() {
        AuditLog log = new AuditLog();
        log.setId(1L);
        log.setUsername("engineer");
        log.setAction(AuditLog.AuditAction.CREATE);
        log.setEntityType("Component");
        log.setEntityId("12");
        log.setSummary("Created component ECE-TEST-001");

        when(auditLogRepository.findAllByOrderByOccurredAtDesc(any())).thenReturn(List.of(log));

        AuditLogService service = new AuditLogService(auditLogRepository);
        List<AuditLogResponse> recent = service.recent(500);

        assertEquals(1, recent.size());
        assertEquals("engineer", recent.get(0).username());
        assertEquals(AuditLog.AuditAction.CREATE, recent.get(0).action());
    }
}
