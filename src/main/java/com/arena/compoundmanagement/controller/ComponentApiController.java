package com.arena.compoundmanagement.controller;

import com.arena.compoundmanagement.dto.ComponentRequest;
import com.arena.compoundmanagement.dto.ComponentResponse;
import com.arena.compoundmanagement.dto.RecommendationItem;
import com.arena.compoundmanagement.dto.RecommendationResponse;
import com.arena.compoundmanagement.dto.SearchResponse;
import com.arena.compoundmanagement.dto.SearchResultItem;
import com.arena.compoundmanagement.model.EngineeringComponent;
import com.arena.compoundmanagement.service.ComponentMapper;
import com.arena.compoundmanagement.service.ComponentService;
import com.arena.compoundmanagement.service.RecommendationService;
import com.arena.compoundmanagement.service.SearchService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/components")
public class ComponentApiController {

    private final ComponentService componentService;
    private final ComponentMapper componentMapper;
    private final SearchService searchService;
    private final RecommendationService recommendationService;

    public ComponentApiController(ComponentService componentService,
                                  ComponentMapper componentMapper,
                                  SearchService searchService,
                                  RecommendationService recommendationService) {
        this.componentService = componentService;
        this.componentMapper = componentMapper;
        this.searchService = searchService;
        this.recommendationService = recommendationService;
    }

    @GetMapping
    public List<ComponentResponse> allComponents() {
        return componentService.findAll().stream().map(componentMapper::toResponse).toList();
    }

    @GetMapping("/{id}")
    public ComponentResponse getComponent(@PathVariable Long id) {
        return componentMapper.toResponse(componentService.findById(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ComponentResponse createComponent(@Valid @RequestBody ComponentRequest request) {
        return componentMapper.toResponse(componentService.create(request));
    }

    @PutMapping("/{id}")
    public ComponentResponse updateComponent(@PathVariable Long id, @Valid @RequestBody ComponentRequest request) {
        return componentMapper.toResponse(componentService.update(id, request));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteComponent(@PathVariable Long id) {
        componentService.delete(id);
    }

    @GetMapping("/search")
    public SearchResponse search(@RequestParam("q") String query) {
        SearchService.SearchOutcome outcome = searchService.search(query, componentService.findAll());
        List<SearchResultItem> items = outcome.matches().stream()
                .map(match -> new SearchResultItem(
                        componentMapper.toResponse(match.component()),
                        match.score(),
                        match.reasons()))
                .toList();
        return new SearchResponse(query, outcome.interpretedIntent(), items);
    }

    @GetMapping("/recommendations")
    public RecommendationResponse recommendations(@RequestParam(value = "componentId", required = false) Long componentId,
                                                  @RequestParam(value = "q", required = false) String query) {
        RecommendationService.RecommendationOutcome outcome;

        if (componentId != null) {
            EngineeringComponent component = componentService.findById(componentId);
            outcome = recommendationService.recommendForComponent(component, componentService.findAll());
        } else if (query != null && !query.isBlank()) {
            outcome = recommendationService.recommendForQuery(query, componentService.findAll());
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Provide either componentId or q for AI recommendations.");
        }

        List<RecommendationItem> recommendations = outcome.matches().stream()
                .map(match -> new RecommendationItem(
                        componentMapper.toResponse(match.component()),
                        match.score(),
                        match.reasons()))
                .toList();

        return new RecommendationResponse(outcome.summary(), recommendations);
    }
}
