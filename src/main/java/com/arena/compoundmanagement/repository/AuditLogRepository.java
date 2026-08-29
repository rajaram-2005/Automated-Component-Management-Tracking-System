package com.arena.compoundmanagement.repository;

import com.arena.compoundmanagement.model.AuditLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    List<AuditLog> findAllByOrderByOccurredAtDesc(Pageable pageable);
}
