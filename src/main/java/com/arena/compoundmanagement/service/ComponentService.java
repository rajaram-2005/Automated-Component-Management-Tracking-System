package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.dto.ComponentRequest;
import com.arena.compoundmanagement.model.EngineeringComponent;
import com.arena.compoundmanagement.model.EngineeringDomain;
import com.arena.compoundmanagement.repository.ComponentRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
@Transactional
public class ComponentService {

    private final ComponentRepository componentRepository;
    private final ClassificationService classificationService;

    public ComponentService(ComponentRepository componentRepository, ClassificationService classificationService) {
        this.componentRepository = componentRepository;
        this.classificationService = classificationService;
    }

    public List<EngineeringComponent> findAll() {
        return componentRepository.findAll(Sort.by(Sort.Direction.DESC, "updatedAt"));
    }

    public EngineeringComponent findById(Long id) {
        return componentRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Component not found: " + id));
    }

    public EngineeringComponent create(ComponentRequest request) {
        EngineeringComponent component = new EngineeringComponent();
        apply(component, request);
        return componentRepository.save(component);
    }

    public EngineeringComponent update(Long id, ComponentRequest request) {
        EngineeringComponent component = findById(id);
        apply(component, request);
        return componentRepository.save(component);
    }

    public void delete(Long id) {
        if (!componentRepository.existsById(id)) {
            throw new EntityNotFoundException("Component not found: " + id);
        }
        componentRepository.deleteById(id);
    }

    private void apply(EngineeringComponent component, ComponentRequest request) {
        ClassificationService.ClassificationOutcome outcome = classificationService.classify(
                request.getName(), request.getSpecifications(), request.getCategory());

        component.setName(request.getName().trim());
        component.setDiscipline(request.getDiscipline() != null ? request.getDiscipline() : outcome.discipline());
        component.setCategory(StringUtils.hasText(request.getCategory()) ? request.getCategory().trim() : outcome.category());
        component.setSubCategory(StringUtils.hasText(request.getSubCategory()) ? request.getSubCategory().trim() : null);
        component.setRegion(request.getRegion().trim());
        component.setManufacturer(StringUtils.hasText(request.getManufacturer()) ? request.getManufacturer().trim() : "Independent Supplier");
        component.setSpecifications(StringUtils.hasText(request.getSpecifications()) ? request.getSpecifications().trim() : "Not specified");
        component.setQuantity(request.getQuantity());
        component.setMinimumStockLevel(request.getMinimumStockLevel());
        component.setMonthlyDemand(request.getMonthlyDemand());
        component.setLeadTimeDays(request.getLeadTimeDays());
        component.setUnitPrice(request.getUnitPrice());
        component.setClassificationConfidence(outcome.confidence());

        if (StringUtils.hasText(request.getComponentCode())) {
            String requestedCode = request.getComponentCode().trim().toUpperCase(Locale.ROOT);
            componentRepository.findByComponentCodeIgnoreCase(requestedCode)
                    .filter(existing -> !existing.getId().equals(component.getId()))
                    .ifPresent(existing -> {
                        throw new IllegalArgumentException("Component code already exists: " + requestedCode);
                    });
            component.setComponentCode(requestedCode);
        } else if (!StringUtils.hasText(component.getComponentCode())) {
            component.setComponentCode(generateComponentCode(component.getDiscipline(), component.getName()));
        }
    }

    private String generateComponentCode(EngineeringDomain domain, String name) {
        String prefix = switch (domain) {
            case EEE -> "EEE";
            case ECE -> "ECE";
            case MECHANICAL -> "MEC";
        };

        String stem = name.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        stem = stem.isBlank() ? "COMP" : stem.substring(0, Math.min(4, stem.length()));

        String candidate;
        do {
            candidate = prefix + "-" + stem + "-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase(Locale.ROOT);
        } while (componentRepository.existsByComponentCodeIgnoreCase(candidate));

        return candidate;
    }
}
