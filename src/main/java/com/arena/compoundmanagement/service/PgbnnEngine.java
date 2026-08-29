package com.arena.compoundmanagement.service;

import com.arena.compoundmanagement.model.EngineeringComponent;
import com.arena.compoundmanagement.model.EngineeringDomain;
import com.arena.compoundmanagement.model.StockRisk;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * PG-BNN — Probabilistic Graph Bayesian Neural Network engine.
 *
 * <p>Three cooperating layers, all pure Java and fully deterministic (fixed
 * per-member seeds) so the same catalog always produces the same brain:</p>
 *
 * <ol>
 *   <li><b>Neural layer</b> — an ensemble of tiny MLPs (one softmax head for
 *       discipline classification, one regression head for days-to-stockout).
 *       Each member is trained by SGD/backprop on a bootstrap sample of the
 *       live catalog with a distinct seed, which makes the member spread a
 *       usable epistemic-uncertainty signal.</li>
 *   <li><b>Bayesian layer</b> — the ensemble mean/std forms a Gaussian
 *       likelihood which is fused with the deterministic inventory-physics
 *       model (the same math as {@link AnalyticsService}) treated as a
 *       conjugate Gaussian prior. Posterior mean + 90% credible band are
 *       reported, never a naked point estimate.</li>
 *   <li><b>Probabilistic graph layer</b> — components become nodes linked by
 *       token/category/region/quantity affinity; classification posteriors are
 *       refined by damped label propagation over that graph, so a part with an
 *       ambiguous name inherits evidence from its neighbours.</li>
 * </ol>
 *
 * <p>The engine never throws at query time: if training data is missing or a
 * forward pass went bad, it degrades to the analytic prior with a wide band
 * and reports a non-{@code ready} status.</p>
 */
public class PgbnnEngine {

    public static final int HASH_DIM = 48;
    public static final int NUM_DIM = 6;
    public static final int REGION_DIM = 7;
    public static final int FEATURE_DIM = HASH_DIM + NUM_DIM + REGION_DIM;
    public static final int DEFAULT_ENSEMBLE = 8;
    public static final int DEFAULT_HIDDEN = 24;
    public static final int DEFAULT_EPOCHS = 120;
    public static final double BAND_Z = 1.6449; // 90% central credible interval

    private static final String[] REGIONS = {
            "Asia-Pacific", "Europe", "North America", "Middle East", "Africa", "South America", "Global"
    };
    private static final Set<String> STOPWORDS = Set.of(
            "with", "for", "the", "and", "from", "show", "find", "module", "low", "high", "stock");

    private final int ensembleSize;
    private final int hiddenSize;
    private final int epochs;

    private volatile Snapshot snapshot = Snapshot.untrained();

    public PgbnnEngine() {
        this(DEFAULT_ENSEMBLE, DEFAULT_HIDDEN, DEFAULT_EPOCHS);
    }

    public PgbnnEngine(int ensembleSize, int hiddenSize, int epochs) {
        this.ensembleSize = Math.max(2, ensembleSize);
        this.hiddenSize = Math.max(4, hiddenSize);
        this.epochs = Math.max(5, epochs);
    }

    /* ------------------------------------------------------------------ */
    /* Public results                                                      */
    /* ------------------------------------------------------------------ */

    public record Health(int ensembleSize, int hiddenNeurons, int inputFeatures, int parameters, int epochs,
                         double finalLoss, long trainMillis, int graphNodes, int graphEdges,
                         Instant trainedAt, String status, List<Double> lossCurve) {
    }

    public record Forecast(double priorDays, double neuralMeanDays, double sigmaDays, double posteriorDays,
                           double lowerDays, double upperDays, double agreementPercent, List<Double> memberDays,
                           boolean neuralActive) {
    }

    public record Classification(double[] probabilities, String bestDiscipline, double topPercent,
                                 double agreementPercent, List<String> signals) {
    }

    public record GraphData(List<Long> nodeIds, List<Edge> edges) {
        public record Edge(long source, long target, double weight) {
        }
    }

    /* ------------------------------------------------------------------ */
    /* Feature encoding                                                    */
    /* ------------------------------------------------------------------ */

    public static String[] regions() {
        return REGIONS.clone();
    }

    public static long fingerprint(List<EngineeringComponent> components) {
        long fp = 17;
        for (EngineeringComponent c : components) {
            fp = fp * 31 + (c.getId() == null ? 0 : c.getId());
            fp = fp * 31 + (c.getName() == null ? 0 : c.getName().hashCode());
            fp = fp * 13 + c.getQuantity() * 31L + c.getMonthlyDemand() * 7L + Long.hashCode(c.getLeadTimeDays());
            fp = fp * 29 + (c.getDiscipline() == null ? 0 : c.getDiscipline().ordinal());
        }
        return fp;
    }

    public static double[] encode(EngineeringComponent c) {
        double[] f = new double[FEATURE_DIM];
        String text = ((c.getName() == null ? "" : c.getName()) + " "
                + (c.getSpecifications() == null ? "" : c.getSpecifications()) + " "
                + (c.getCategory() == null ? "" : c.getCategory()) + " "
                + (c.getSubCategory() == null ? "" : c.getSubCategory())).toLowerCase();
        for (String token : text.split("[^a-z0-9]+")) {
            if (token.length() < 3 || STOPWORDS.contains(token)) {
                continue;
            }
            int slot = Math.abs(token.hashCode() % HASH_DIM);
            f[slot] += 0.25;
        }
        for (int i = 0; i < HASH_DIM; i++) {
            f[i] = Math.min(f[i], 1.0);
        }

        double demand = Math.max(c.getMonthlyDemand(), 0.1);
        double days = c.getQuantity() <= 0 ? 0 : (c.getQuantity() / demand) * 30.0;
        int o = HASH_DIM;
        f[o++] = Math.min(Math.log1p(Math.max(c.getQuantity(), 0)) / 6.0, 1.0);
        f[o++] = Math.min(Math.log1p(Math.max(c.getMinimumStockLevel(), 0)) / 6.0, 1.0);
        f[o++] = Math.min(Math.log1p(Math.max(c.getMonthlyDemand(), 0)) / 5.0, 1.0);
        f[o++] = Math.min(Math.max(c.getLeadTimeDays(), 0) / 90.0, 1.0);
        f[o++] = Math.min(Math.max(c.getUnitPrice(), 0) / 200.0, 1.0);
        f[o++] = Math.min(days / 180.0, 1.0);

        int regionIdx = 0;
        for (int i = 0; i < REGIONS.length; i++) {
            if (REGIONS[i].equalsIgnoreCase(String.valueOf(c.getRegion()))) {
                regionIdx = i;
                break;
            }
        }
        f[HASH_DIM + NUM_DIM + regionIdx] = 1.0;
        return f;
    }

    /* ------------------------------------------------------------------ */
    /* Training                                                            */
    /* ------------------------------------------------------------------ */

    public synchronized TrainingStats train(List<EngineeringComponent> components) {
        long started = System.nanoTime();
        List<EngineeringComponent> data = components == null ? List.of() : components;
        if (data.isEmpty()) {
            snapshot = Snapshot.untrained();
            return new TrainingStats(0, 0, 0, "no-data");
        }

        double[][] features = new double[data.size()][];
        int[] labelClass = new int[data.size()];
        double[] labelDays = new double[data.size()];
        for (int i = 0; i < data.size(); i++) {
            EngineeringComponent c = data.get(i);
            features[i] = encode(c);
            EngineeringDomain d = c.getDiscipline();
            labelClass[i] = d == null ? 0 : d.ordinal();
            labelDays[i] = Math.log1p(baseDays(c));
        }

        List<Net> classMembers = new ArrayList<>();
        List<Net> regMembers = new ArrayList<>();
        double lossSum = 0;
        List<Double> lossCurve = new ArrayList<>();
        for (int m = 0; m < ensembleSize; m++) {
            int[] sample = bootstrap(data.size(), 1_000L + m * 7919L);
            double[][] xs = pick(features, sample);
            double[][] cls = oneHot(labelClass, sample, EngineeringDomain.values().length);
            double[][] dys = new double[sample.length][1];
            for (int i = 0; i < sample.length; i++) {
                dys[i][0] = labelDays[sample[i]];
            }

            Net cn = new Net(FEATURE_DIM, hiddenSize, EngineeringDomain.values().length, 1000L + m);
            Net rn = new Net(FEATURE_DIM, hiddenSize, 1, 9_000L + m);
            double lastLoss = 0;
            for (int epoch = 0; epoch < epochs; epoch++) {
                lastLoss = cn.trainOnce(xs, cls, 0.25, 1e-4) + rn.trainOnce(xs, dys, 0.08, 1e-4);
            }
            lossSum += lastLoss;
            lossCurve.add(round(lossSum / (m + 1) * 100.0) / 100.0);
            classMembers.add(cn);
            regMembers.add(rn);
        }

        GraphData graph = buildGraph(data);
        Map<Long, double[]> basePosteriors = new HashMap<>();
        for (int i = 0; i < data.size(); i++) {
            basePosteriors.put(idOf(data.get(i)), softmaxAvg(classMembers, features[i]));
        }
        Map<Long, double[]> refined = propagate(basePosteriors, graph);

        double avgLoss = round(lossSum / ensembleSize * 1000.0) / 1000.0;
        long millis = (System.nanoTime() - started) / 1_000_000L;
        snapshot = new Snapshot(avgLoss, millis, List.copyOf(lossCurve),
                classMembers, regMembers, refined, graph,
                fingerprint(data), Instant.now(), "ready");
        return new TrainingStats(data.size(), round(avgLoss * 100) / 100, (int) millis, "ready");
    }

    public record TrainingStats(int trainedOn, double finalLoss, int millis, String status) {
    }

    /* ------------------------------------------------------------------ */
    /* Inference                                                           */
    /* ------------------------------------------------------------------ */

    public Forecast forecast(EngineeringComponent c) {
        double prior = Math.max(baseDays(c), 0);
        Snapshot s = snapshot;
        if (!"ready".equals(s.status)) {
            double sigma = Math.max(6, 0.35 * prior);
            return new Forecast(prior, prior, sigma, prior, Math.max(0, prior - 1.6449 * sigma),
                    prior + 1.6449 * sigma, 0, List.of(), false);
        }

        double[] f = encode(c);
        List<Double> memberDays = new ArrayList<>();
        for (Net net : s.regMembers) {
            double[] out = net.forward(f);
            double v = out.length > 0 ? Math.expm1(safe(out[0])) : prior;
            memberDays.add(Math.max(0, Math.min(v, 3650)));
        }
        double mean = mean(memberDays);
        double std = Math.max(std(memberDays, mean), 2 + 0.06 * mean); // epistemic floor

        // Gaussian conjugate update: analytic physics prior vs neural likelihood.
        double s0 = Math.max(3, 0.18 * prior + 1);
        double precision = 1 / (s0 * s0) + 1 / (std * std);
        double posterior = ((prior / (s0 * s0)) + (mean / (std * std))) / precision;
        double sigma = Math.sqrt(1 / precision);

        double agreement = 0;
        if (!memberDays.isEmpty()) {
            double tol = Math.max(1.5, 0.25 * mean);
            long within = memberDays.stream().filter(v -> Math.abs(v - mean) <= tol).count();
            agreement = round(within * 100.0 / memberDays.size());
        }

        return new Forecast(round(prior), round(mean), round(sigma), round(posterior),
                Math.max(0, round(posterior - BAND_Z * sigma)), round(posterior + BAND_Z * sigma),
                agreement, memberDays.stream().map(PgbnnEngine::round).toList(), true);
    }

    /** Classification posterior for arbitrary text; graph refinement applies when the component is in the catalog. */
    public Classification classify(EngineeringComponent c) {
        Snapshot s = snapshot;
        double[] f = encode(c);
        if (!"ready".equals(s.status)) {
            return new Classification(uniform(), "UNKNOWN", 33.3, 0, List.of("engine not trained yet"));
        }
        double[] probs = softmaxAvg(s.classMembers, f);
        int top = 0;
        for (int i = 1; i < probs.length; i++) {
            if (probs[i] > probs[top]) {
                top = i;
            }
        }

        List<String> signals = new ArrayList<>();
        Long id = c.getId();
        if (id != null && s.refined.containsKey(id)) {
            double[] prop = s.refined.get(id);
            int t2 = 0;
            for (int i = 1; i < prop.length; i++) {
                if (prop[i] > prop[t2]) {
                    t2 = i;
                }
            }
            if (t2 != top) {
                signals.add("graph label propagation re-ranked to " + EngineeringDomain.values()[t2].name());
            } else {
                signals.add("graph label propagation confirmed neural ranking");
            }
            probs = prop;
            top = t2;
        }

        double agreement = 0;
        int agreeCount = 0;
        for (Net net : s.classMembers) {
            double[] o = softmax(net.forward(f));
            int arg = 0;
            for (int i = 1; i < o.length; i++) {
                if (o[i] > o[arg]) {
                    arg = i;
                }
            }
            if (arg == top) {
                agreeCount++;
            }
        }
        agreement = round(agreeCount * 100.0 / s.classMembers.size());

        int neighbourCount = 0;
        for (GraphData.Edge e : s.graph.edges()) {
            if (e.source() == (id == null ? -1 : id) || e.target() == (id == null ? -1 : id)) {
                neighbourCount++;
            }
        }
        signals.add("ensemble of " + s.classMembers.size() + " networks, " + neighbourCount + " graph links");
        return new Classification(probs, EngineeringDomain.values()[top].name(),
                round(probs[top] * 1000.0) / 10.0, agreement, List.copyOf(signals));
    }

    public Health health() {
        Snapshot s = snapshot;
        int params = s.classMembers.isEmpty() ? 0
                : s.classMembers.size() * (FEATURE_DIM * hiddenSize + hiddenSize + hiddenSize * 3 + 3)
                + s.regMembers.size() * (FEATURE_DIM * hiddenSize + hiddenSize + hiddenSize + 1);
        return new Health(ensembleSize, hiddenSize, FEATURE_DIM, params, epochs, s.finalLoss,
                s.trainMillis, s.graph.nodeIds().size(), s.graph.edges().size(),
                s.trainedAt, s.status, s.lossCurve);
    }

    public GraphData graph() {
        return snapshot.graph;
    }

    public Map<Long, double[]> refinedPosteriors() {
        return snapshot.refined;
    }

    /* ------------------------------------------------------------------ */
    /* Graph layer                                                         */
    /* ------------------------------------------------------------------ */

    static GraphData buildGraph(List<EngineeringComponent> data) {
        int n = data.size();
        List<long[]> tokenIds = new ArrayList<>();
        List<Set<String>> tokens = new ArrayList<>();
        List<Double> logQty = new ArrayList<>();
        for (EngineeringComponent c : data) {
            Set<String> set = new HashSet<>();
            for (String t : (c.getName() + " " + (c.getSpecifications() == null ? "" : c.getSpecifications())
                    + " " + (c.getCategory() == null ? "" : c.getCategory())).toLowerCase().split("[^a-z0-9]+")) {
                if (t.length() >= 3 && !STOPWORDS.contains(t)) {
                    set.add(t);
                }
            }
            tokens.add(set);
            logQty.add(Math.log1p(Math.max(c.getQuantity(), 0)));
        }

        List<GraphData.Edge> edges = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                EngineeringComponent a = data.get(i);
                EngineeringComponent b = data.get(j);
                double jac = jaccard(tokens.get(i), tokens.get(j));
                double w = 0.55 * jac
                        + (a.getDiscipline() == b.getDiscipline() ? 0.15 : 0)
                        + (a.getCategory() != null && a.getCategory().equals(b.getCategory()) ? 0.12 : 0)
                        + (a.getRegion() != null && a.getRegion().equals(b.getRegion()) ? 0.08 : 0)
                        + 0.10 * (1 - Math.min(1, Math.abs(logQty.get(i) - logQty.get(j)) / 3.0));
                if (w >= 0.30 && idOf(a) != null && idOf(b) != null) {
                    edges.add(new GraphData.Edge(idOf(a), idOf(b), round(w * 1000) / 1000.0));
                }
            }
        }
        edges.sort(Comparator.comparingDouble((GraphData.Edge e) -> e.weight()).reversed());
        if (edges.size() > 60) {
            edges = new ArrayList<>(edges.subList(0, 60));
        }
        List<Long> nodeIds = new ArrayList<>();
        for (EngineeringComponent c : data) {
            if (idOf(c) != null) {
                nodeIds.add(idOf(c));
            }
        }
        return new GraphData(nodeIds, edges);
    }

    private static Map<Long, double[]> propagate(Map<Long, double[]> base, GraphData graph) {
        Map<Long, double[]> current = new LinkedHashMap<>();
        base.forEach((k, v) -> current.put(k, v.clone()));
        Map<Long, List<Long>> adjacency = new HashMap<>();
        for (GraphData.Edge e : graph.edges()) {
            adjacency.computeIfAbsent(e.source(), k -> new ArrayList<>()).add(e.target());
            adjacency.computeIfAbsent(e.target(), k -> new ArrayList<>()).add(e.source());
        }
        for (int it = 0; it < 5; it++) {
            Map<Long, double[]> next = new LinkedHashMap<>();
            for (Map.Entry<Long, double[]> entry : current.entrySet()) {
                double[] own = entry.getValue();
                double[] mixed = own.clone();
                List<Long> neighbours = adjacency.getOrDefault(entry.getKey(), List.of());
                if (!neighbours.isEmpty()) {
                    double[] avg = new double[own.length];
                    for (Long nb : neighbours) {
                        double[] other = current.getOrDefault(nb, own);
                        for (int i = 0; i < avg.length; i++) {
                            avg[i] += other[i];
                        }
                    }
                    for (int i = 0; i < avg.length; i++) {
                        avg[i] /= neighbours.size();
                        mixed[i] = 0.8 * own[i] + 0.2 * avg[i];
                    }
                }
                next.put(entry.getKey(), softmax(mixed));
            }
            current = next;
        }
        return current;
    }

    /* ------------------------------------------------------------------ */
    /* Tiny MLP                                                            */
    /* ------------------------------------------------------------------ */

    static final class Net {
        final int inputs;
        final int hidden;
        final int outputs;
        final double[][] w1;
        final double[] b1;
        final double[][] w2;
        final double[] b2;

        Net(int inputs, int hidden, int outputs, long seed) {
            Random r = new Random(seed);
            this.inputs = inputs;
            this.hidden = hidden;
            this.outputs = outputs;
            this.w1 = new double[hidden][inputs];
            this.b1 = new double[hidden];
            this.w2 = new double[outputs][hidden];
            this.b2 = new double[outputs];
            double scale = Math.sqrt(2.0 / inputs);
            for (int i = 0; i < hidden; i++) {
                for (int j = 0; j < inputs; j++) {
                    w1[i][j] = r.nextGaussian() * scale;
                }
                b1[i] = r.nextDouble() * 0.1;
            }
            double hScale = Math.sqrt(2.0 / hidden);
            for (int i = 0; i < outputs; i++) {
                for (int j = 0; j < hidden; j++) {
                    w2[i][j] = r.nextGaussian() * hScale;
                }
                b2[i] = 0;
            }
        }

        double[] forward(double[] x) {
            double[] h = new double[hidden];
            for (int i = 0; i < hidden; i++) {
                double z = b1[i];
                double[] row = w1[i];
                for (int j = 0; j < inputs; j++) {
                    z += row[j] * x[j];
                }
                h[i] = Math.max(0, z);
            }
            double[] out = new double[outputs];
            for (int i = 0; i < outputs; i++) {
                double z = b2[i];
                double[] row = w2[i];
                for (int j = 0; j < hidden; j++) {
                    z += row[j] * h[j];
                }
                out[i] = z;
            }
            return out;
        }

        /** One SGD pass over the batch; returns mean squared error (classification uses softmax+CE internally). */
        double trainOnce(double[][] xs, double[][] ys, double lr, double weightDecay) {
            double loss = 0;
            for (int s = 0; s < xs.length; s++) {
                double[] x = xs[s];
                double[] y = ys[s];

                double[] h = new double[hidden];
                for (int i = 0; i < hidden; i++) {
                    double z = b1[i];
                    for (int j = 0; j < inputs; j++) {
                        z += w1[i][j] * x[j];
                    }
                    h[i] = Math.max(0, z);
                }
                double[] logits = new double[outputs];
                for (int i = 0; i < outputs; i++) {
                    double z = b2[i];
                    for (int j = 0; j < hidden; j++) {
                        z += w2[i][j] * h[j];
                    }
                    logits[i] = z;
                }

                double[] out = logits;
                double[] dy;
                boolean classification = outputs > 1;
                if (classification) {
                    double[] p = softmax(logits);
                    dy = new double[outputs];
                    for (int i = 0; i < outputs; i++) {
                        double pi = safe(p[i]);
                        loss += -y[i] * Math.log(Math.max(pi, 1e-9));
                        dy[i] = pi - y[i];
                    }
                } else {
                    dy = new double[]{out[0] - y[0]};
                    loss += 0.5 * dy[0] * dy[0];
                }

                double[] dh = new double[hidden];
                for (int i = 0; i < hidden; i++) {
                    double g = 0;
                    for (int o = 0; o < outputs; o++) {
                        g += w2[o][i] * dy[o];
                    }
                    dh[i] = h[i] > 0 ? g : 0;
                }
                for (int o = 0; o < outputs; o++) {
                    for (int i = 0; i < hidden; i++) {
                        w2[o][i] -= lr * dy[o] * h[i] + lr * weightDecay * w2[o][i];
                    }
                    b2[o] -= lr * dy[o];
                }
                for (int i = 0; i < hidden; i++) {
                    if (h[i] <= 0) {
                        continue;
                    }
                    for (int j = 0; j < inputs; j++) {
                        w1[i][j] -= lr * dh[i] * x[j] + lr * weightDecay * w1[i][j];
                    }
                    b1[i] -= lr * dh[i];
                }
            }
            return loss / Math.max(1, xs.length);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Helpers                                                             */
    /* ------------------------------------------------------------------ */

    private static double baseDays(EngineeringComponent c) {
        double demand = Math.max(c.getMonthlyDemand(), 0.1);
        return c.getQuantity() <= 0 ? 0 : (c.getQuantity() / demand) * 30.0;
    }

    static StockRisk riskOf(EngineeringComponent c, double daysToStockout) {
        if (c.getQuantity() <= Math.max(1, c.getMinimumStockLevel() / 2) || daysToStockout <= c.getLeadTimeDays()) {
            return StockRisk.CRITICAL;
        }
        if (c.getQuantity() <= c.getMinimumStockLevel() || daysToStockout <= c.getLeadTimeDays() + 30) {
            return StockRisk.HIGH;
        }
        if (daysToStockout <= 90) {
            return StockRisk.MODERATE;
        }
        return StockRisk.LOW;
    }

    private static int[] bootstrap(int n, long seed) {
        Random r = new Random(seed);
        if (n < 16) {
            int[] all = new int[n];
            for (int i = 0; i < n; i++) {
                all[i] = i;
            }
            return all;
        }
        int[] idx = new int[n];
        for (int i = 0; i < n; i++) {
            idx[i] = r.nextInt(n);
        }
        return idx;
    }

    private static double[][] pick(double[][] source, int[] idx) {
        double[][] out = new double[idx.length][];
        for (int i = 0; i < idx.length; i++) {
            out[i] = source[idx[i]];
        }
        return out;
    }

    private static double[][] oneHot(int[] labels, int[] idx, int classes) {
        double[][] out = new double[idx.length][classes];
        for (int i = 0; i < idx.length; i++) {
            out[i][labels[idx[i]]] = 1.0;
        }
        return out;
    }

    private static double[] softmaxAvg(List<Net> nets, double[] x) {
        double[] avg = new double[EngineeringDomain.values().length];
        for (Net net : nets) {
            double[] p = softmax(net.forward(x));
            for (int i = 0; i < avg.length; i++) {
                avg[i] += p[i];
            }
        }
        for (int i = 0; i < avg.length; i++) {
            avg[i] = safe(avg[i] / nets.size());
        }
        return avg;
    }

    private static double[] softmax(double[] z) {
        double max = Double.NEGATIVE_INFINITY;
        for (double v : z) {
            max = Math.max(max, v);
        }
        double[] p = new double[z.length];
        double sum = 0;
        for (int i = 0; i < z.length; i++) {
            p[i] = Math.exp(Math.max(-50, Math.min(50, z[i] - max)));
            sum += p[i];
        }
        if (sum <= 0 || Double.isNaN(sum)) {
            return uniform(z.length);
        }
        for (int i = 0; i < p.length; i++) {
            p[i] /= sum;
        }
        return p;
    }

    private static double[] uniform() {
        return uniform(EngineeringDomain.values().length);
    }

    private static double[] uniform(int n) {
        double[] u = new double[n];
        Arrays.fill(u, 1.0 / n);
        return u;
    }

    private static Long idOf(EngineeringComponent c) {
        return c.getId();
    }

    private static double jaccard(Set<String> a, Set<String> b) {
        if (a.isEmpty() || b.isEmpty()) {
            return 0;
        }
        Set<String> inter = new HashSet<>(a);
        inter.retainAll(b);
        Set<String> union = new HashSet<>(a);
        union.addAll(b);
        return union.isEmpty() ? 0 : (double) inter.size() / union.size();
    }

    private static double mean(List<Double> v) {
        if (v.isEmpty()) {
            return 0;
        }
        double s = 0;
        for (double d : v) {
            s += d;
        }
        return s / v.size();
    }

    private static double std(List<Double> v, double mean) {
        if (v.size() < 2) {
            return 0;
        }
        double s = 0;
        for (double d : v) {
            s += (d - mean) * (d - mean);
        }
        return Math.sqrt(s / (v.size() - 1));
    }

    private static double safe(double v) {
        return (Double.isNaN(v) || Double.isInfinite(v)) ? 0 : v;
    }

    private static double round(double v) {
        return Math.round(safe(v) * 100.0) / 100.0;
    }

    /* ------------------------------------------------------------------ */

    private static final class Snapshot {
        final double finalLoss;
        final long trainMillis;
        final List<Double> lossCurve;
        final List<Net> classMembers;
        final List<Net> regMembers;
        final Map<Long, double[]> refined;
        final GraphData graph;
        final long fingerprint;
        final Instant trainedAt;
        final String status;

        Snapshot(double finalLoss, long trainMillis, List<Double> lossCurve, List<Net> classMembers,
                 List<Net> regMembers, Map<Long, double[]> refined, GraphData graph, long fingerprint,
                 Instant trainedAt, String status) {
            this.finalLoss = finalLoss;
            this.trainMillis = trainMillis;
            this.lossCurve = lossCurve;
            this.classMembers = classMembers;
            this.regMembers = regMembers;
            this.refined = refined;
            this.graph = graph;
            this.fingerprint = fingerprint;
            this.trainedAt = trainedAt;
            this.status = status;
        }

        static Snapshot untrained() {
            return new Snapshot(0, 0, List.of(), List.of(), List.of(), Map.of(),
                    new GraphData(List.of(), List.of()), -1, null, "untrained");
        }
    }
}
