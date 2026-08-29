package com.arena.compoundmanagement.controller;

import com.arena.compoundmanagement.dto.PgbnnForecastResponse;
import com.arena.compoundmanagement.dto.PgbnnGraphResponse;
import com.arena.compoundmanagement.dto.PgbnnHealthResponse;
import com.arena.compoundmanagement.dto.PgbnnPreviewRequest;
import com.arena.compoundmanagement.dto.PgbnnPreviewResponse;
import com.arena.compoundmanagement.service.PgbnnService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * PG-BNN — Probabilistic Graph Bayesian Neural Network endpoints.
 * Sits alongside the rule-based {@link AiController}; the heuristic classifier
 * is untouched and remains the save-path authority.
 */
@RestController
@RequestMapping("/api/ai/pgbnn")
public class PgbnnController {

    private final PgbnnService pgbnnService;

    public PgbnnController(PgbnnService pgbnnService) {
        this.pgbnnService = pgbnnService;
    }

    @GetMapping("/health")
    public PgbnnHealthResponse health() {
        return pgbnnService.health();
    }

    @PostMapping("/retrain")
    public PgbnnHealthResponse retrain() {
        return pgbnnService.retrain();
    }

    @GetMapping("/graph")
    public PgbnnGraphResponse graph() {
        return pgbnnService.graph();
    }

    @GetMapping("/forecast/{id}")
    public PgbnnForecastResponse forecast(@PathVariable Long id) {
        return pgbnnService.forecast(id);
    }

    @PostMapping("/preview")
    public PgbnnPreviewResponse preview(@RequestBody(required = false) PgbnnPreviewRequest request) {
        return pgbnnService.preview(request == null
                ? new PgbnnPreviewRequest(null, null, null, null, null, null, null, null, null, null, null)
                : request);
    }
}
