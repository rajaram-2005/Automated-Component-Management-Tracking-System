package com.arena.compoundmanagement.repository;

import com.arena.compoundmanagement.model.EngineeringComponent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ComponentRepository extends JpaRepository<EngineeringComponent, Long> {
    boolean existsByComponentCodeIgnoreCase(String componentCode);
    Optional<EngineeringComponent> findByComponentCodeIgnoreCase(String componentCode);
}
