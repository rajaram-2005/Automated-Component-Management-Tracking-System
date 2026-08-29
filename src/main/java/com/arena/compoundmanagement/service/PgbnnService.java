package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.dto.PgbnnForecastResponse;
import com.arena.compoundmanagement.dto.PgbnnGraphResponse;
import com.arena.compoundmanagement.dto.PgbnnHealthResponse;
import com.arena.compoundmanagement.dto.PgbnnPreviewRequest;
import com.arena.compoundmanagement.dto.PgbnnPreviewResponse;
import com.arena.compoundmanagement.model.EngineeringComponent;
import com.arena.compoundmanagement.model.EngineeringDomain;
import com.arena.compoundmanagement.repository.ComponentRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Spring-facing wrapper around {@link PgbnnEngine}. The engine retrains lazily
 * whenever the catalog fingerprint changes (create/update/delete), so the
 * graph, posteriors and ensemble always reflect live data without touching
 * write paths or adding event plumbing.
 */
@Service
public class PgbnnService {

    private final ComponentRepository componentRepository;
    private final PgbnnEngine engine = new PgbnnEngine();
    private final AtomicLong trainedFingerprint = new AtomicLong(Long.MIN_VALUE);

    public PgbnnService(ComponentRepository componentRepository) {
        this.componentRepository = componentRepository;
    }

    private synchronized List<EngineeringComponent> ensureFresh() {
        List<EngineeringComponent> all = componentRepository.findAll();
        long fp = PgbnnEngine.fingerprint(all);
        if (fp != trainedFingerprint.get()) {
            engine.train(all);
            trainedFingerprint.set(fp);
        }
        return all;
    }

    public PgbnnHealthResponse health() {
        ensureFresh();
        PgbnnEngine.Health h = engine.health();
        return new PgbnnHealthResponse(h.ensembleSize(), h.hiddenNeurons(), h.inputFeatures(), h.parameters(),
                h.epochs(), h.finalLoss(), h.trainMillis(), h.graphNodes(), h.graphEdges(),
                h.trainedAt(), h.status(), h.lossCurve());
    }

    public PgbnnHealthResponse retrain() {
        List<EngineeringComponent> all = componentRepository.findAll();
        engine.train(all);
        trainedFingerprint.set(PgbnnEngine.fingerprint(all));
        PgbnnEngine.Health h = engine.health();
        return new PgbnnHealthResponse(h.ensembleSize(), h.hiddenNeurons(), h.inputFeatures(), h.parameters(),
                h.epochs(), h.finalLoss(), h.trainMillis(), h.graphNodes(), h.graphEdges(),
                h.trainedAt(), h.status(), h.lossCurve());
    }

    public PgbnnGraphResponse graph() {
        List<EngineeringComponent> all = ensureFresh();
        Map<Long, EngineeringComponent> byId = new HashMap<>();
        for (EngineeringComponent c : all) {
            byId.put(c.getId(), c);
        }

        PgbnnEngine.GraphData data = engine.graph();
        Map<Long, Integer> degrees = new HashMap<>();
        for (PgbnnEngine.GraphData.Edge e : data.edges()) {
            degrees.merge(e.source(), 1, Integer::sum);
            degrees.merge(e.target(), 1, Integer::sum);
        }

        List<PgbnnGraphResponse.NodeView> nodes = new ArrayList<>();
        for (Long id : data.nodeIds()) {
            EngineeringComponent c = byId.get(id);
            if (c == null) {
                continue;
            }
            nodes.add(new PgbnnGraphResponse.NodeView(
                    id,
                    c.getName(),
                    c.getComponentCode(),
                    c.getDiscipline() == null ? "UNKNOWN" : c.getDiscipline().name(),
                    PgbnnEngine.riskOf(c, daysToStockout(c)).name(),
                    c.getQuantity(),
                    degrees.getOrDefault(id, 0)
            ));
        }
        List<PgbnnGraphResponse.EdgeView> edges = data.edges().stream()
                .map(e -> new PgbnnGraphResponse.EdgeView(e.source(), e.target(), e.weight()))
                .toList();
        return new PgbnnGraphResponse(nodes, edges);
    }

    public PgbnnForecastResponse forecast(Long componentId) {
        ensureFresh();
        EngineeringComponent component = componentRepository.findById(componentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Component not found"));

        PgbnnEngine.Forecast f = engine.forecast(component);
        var risk = PgbnnEngine.riskOf(component, f.posteriorDays());
        String narrative = String.format(
                "Posterior 90%% credible band spans %.1f to %.1f days (sigma %.1f days); ensemble mean %.1f days, agreement %.0f%%",
                f.lowerDays(), f.upperDays(), f.sigmaDays(), f.neuralMeanDays(), f.agreementPercent());

        return new PgbnnForecastResponse(
                component.getId(),
                component.getName(),
                component.getComponentCode(),
                component.getDiscipline() == null ? "UNKNOWN" : component.getDiscipline().name(),
                f.priorDays(),
                f.neuralMeanDays(),
                f.sigmaDays(),
                f.posteriorDays(),
                f.lowerDays(),
                f.upperDays(),
                f.agreementPercent(),
                risk.name(),
                narrative,
                f.neuralActive(),
                f.memberDays()
        );
    }

    public PgbnnPreviewResponse preview(PgbnnPreviewRequest request) {
        ensureFresh();
        EngineeringComponent draft = draftComponent(request);

        PgbnnEngine.Classification cls = engine.classify(draft);
        PgbnnEngine.Forecast f = engine.forecast(draft);

        double[] probs = cls.probabilities();
        List<PgbnnPreviewResponse.DomainProbability> domainProbs = new ArrayList<>();
        EngineeringDomain[] domains = EngineeringDomain.values();
        for (int i = 0; i < domains.length && i < probs.length; i++) {
            domainProbs.add(new PgbnnPreviewResponse.DomainProbability(
                    domains[i].name(), Math.round(probs[i] * 1000.0) / 10.0));
        }

        return new PgbnnPreviewResponse(
                domainProbs,
                cls.bestDiscipline(),
                cls.topPercent(),
                cls.agreementPercent(),
                f.priorDays(),
                f.posteriorDays(),
                f.sigmaDays(),
                f.lowerDays(),
                f.upperDays(),
                f.agreementPercent(),
                cls.signals()
        );
    }

    /* ------------------------------------------------------------------ */

    private static EngineeringComponent draftComponent(PgbnnPreviewRequest r) {
        EngineeringComponent c = new EngineeringComponent();
        c.setName(r.name() == null ? "" : r.name());
        c.setSpecifications(r.specifications());
        c.setCategory(r.category());
        c.setSubCategory(r.subCategory());
        c.setRegion(r.region() == null ? "Global" : r.region());
        c.setDiscipline(r.discipline());
        c.setQuantity(r.quantity() == null ? 0 : Math.max(0, r.quantity()));
        c.setMinimumStockLevel(r.minimumStockLevel() == null ? 0 : Math.max(0, r.minimumStockLevel()));
        c.setMonthlyDemand(r.monthlyDemand() == null ? 0 : Math.max(0, r.monthlyDemand()));
        c.setLeadTimeDays(r.leadTimeDays() == null ? 0 : Math.max(0, r.leadTimeDays()));
        c.setUnitPrice(r.unitPrice() == null ? 0 : Math.max(0, r.unitPrice()));
        return c;
    }

    private static double daysToStockout(EngineeringComponent c) {
        double demand = Math.max(c.getMonthlyDemand(), 0.1);
        return c.getQuantity() <= 0 ? 0 : (c.getQuantity() / demand) * 30.0;
    }
}
