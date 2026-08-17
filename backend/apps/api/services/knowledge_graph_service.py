import math
from collections import Counter
from typing import Any

import networkx as nx
from datetime import timedelta
from apps.crypto import decrypt_json
from apps.db import get_connection, utc_now

MIN_NODE_FREQUENCY = 2


def _clean_trigger(raw: str) -> str:
    return str(raw).strip().lower()


def _clean_belief(raw: str) -> str:
    return str(raw).strip().rstrip(".")


def _fetch_entries(user_id: int, days: int) -> list[dict[str, Any]]:
    cutoff = utc_now() - timedelta(days=days)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT triggers, core_beliefs
                FROM journal_entries_v2
                WHERE user_id = %s AND created_at >= %s
                """,
                (user_id, cutoff),
            )
            rows = cur.fetchall()

    for row in rows:
        row["triggers"] = decrypt_json(row["triggers"], default=[])
        row["core_beliefs"] = decrypt_json(row["core_beliefs"], default=[])
    return rows


def _hub_shells(sub: nx.Graph) -> list[list[str]]:
    """Group a connected component into concentric rings around its hub.

    Ring 0 is the single node with the highest mention frequency; each
    further ring is the set of nodes that many hops away from it. Feeding
    this to shell_layout produces an "orbit" look instead of a scattered blob.
    """
    nodes = list(sub.nodes())
    if len(nodes) == 1:
        return [nodes]
    hub = max(nodes, key=lambda n: sub.nodes[n].get("weight", 1))
    layers = nx.single_source_shortest_path_length(sub, hub)
    max_layer = max(layers.values())
    shells: list[list[str]] = [[] for _ in range(max_layer + 1)]
    for n, d in layers.items():
        shells[d].append(n)
    return shells


MIN_RING_ARC_GAP = 0.85
MIN_RING_STEP = 0.9


def _orbit_layout(sub: nx.Graph) -> dict[str, tuple[float, float]]:
    """Place the hub at the center and each further hop on its own ring.

    Unlike nx.shell_layout (fixed radius per ring regardless of how many
    nodes sit on it), the ring radius here grows with the node count so a
    crowded ring gets enough circumference to keep nodes from overlapping.
    """
    shells = _hub_shells(sub)
    if len(shells) == 1:
        return {shells[0][0]: (0.0, 0.0)}

    positions: dict[str, tuple[float, float]] = {}
    prev_radius = 0.0
    for ring_index, ring_nodes in enumerate(shells):
        if ring_index == 0:
            radius = 0.0
        else:
            needed_for_spacing = (len(ring_nodes) * MIN_RING_ARC_GAP) / (2 * math.pi)
            radius = max(prev_radius + MIN_RING_STEP, needed_for_spacing)
        prev_radius = radius
        angle_offset = (ring_index * math.pi) / len(shells)
        count = len(ring_nodes)
        for j, node in enumerate(ring_nodes):
            theta = angle_offset + (2 * math.pi * j / count if count else 0.0)
            positions[node] = (radius * math.cos(theta), radius * math.sin(theta))
    return positions


def _pack_components(graph: nx.Graph) -> dict[str, tuple[float, float]]:
    """Lay out each connected component as its own orbit, then tile the
    orbits closely together instead of letting spring-layout repulsion
    scatter unrelated clusters across unbounded space.
    """
    components = sorted(nx.connected_components(graph), key=len, reverse=True)
    laid_out = []
    for comp in components:
        sub = graph.subgraph(comp)
        pos = _orbit_layout(sub)
        radius = max((x * x + y * y) ** 0.5 for x, y in pos.values()) if len(pos) > 1 else 0.0
        laid_out.append((max(radius, 0.35), pos))

    placed: dict[str, tuple[float, float]] = {}
    row_width_budget = max(2.5, sum(r for r, _ in laid_out) ** 0.5 * 2.2)
    cursor_x = 0.0
    row_y = 0.0
    row_height = 0.0
    for radius, pos in laid_out:
        span = radius * 2 + 0.5
        if cursor_x > 0 and cursor_x + span > row_width_budget:
            cursor_x = 0.0
            row_y += row_height + 0.5
            row_height = 0.0
        cx, cy = cursor_x + radius + 0.25, row_y + radius + 0.25
        for node, (x, y) in pos.items():
            placed[node] = (x + cx, y + cy)
        cursor_x += span
        row_height = max(row_height, span)
    return placed


def _fetch_loop_edges(user_id: int) -> list[dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT trigger, core_belief, detection_count, confidence_score
                FROM loops
                WHERE user_id = %s
                """,
                (user_id,),
            )
            return cur.fetchall()


def build_knowledge_graph(user_id: int, days: int = 30) -> dict[str, Any]:
    """Bipartite trigger<->core-belief graph built with NetworkX.

    An edge means a trigger and a core belief were mentioned together in the
    same journal entry; edge weight is how often that pairing occurred.
    Pairings that were promoted to a detected `loop` are flagged so the
    frontend can render them as confirmed patterns rather than one-offs.
    """
    entries = _fetch_entries(user_id, days)

    trigger_labels: dict[str, str] = {}
    belief_labels: dict[str, str] = {}
    trigger_counter: Counter[str] = Counter()
    belief_counter: Counter[str] = Counter()
    pair_counter: Counter[tuple[str, str]] = Counter()

    for row in entries:
        raw_triggers = row.get("triggers") or []
        raw_beliefs = row.get("core_beliefs") or []

        entry_triggers = set()
        for t in raw_triggers:
            cleaned = _clean_trigger(t)
            if not cleaned:
                continue
            trigger_labels.setdefault(cleaned, str(t).strip())
            entry_triggers.add(cleaned)

        entry_beliefs = set()
        for b in raw_beliefs:
            cleaned = _clean_belief(b)
            if not cleaned:
                continue
            belief_labels.setdefault(cleaned, cleaned)
            entry_beliefs.add(cleaned)

        for t in entry_triggers:
            trigger_counter[t] += 1
        for b in entry_beliefs:
            belief_counter[b] += 1
        for t in entry_triggers:
            for b in entry_beliefs:
                pair_counter[(t, b)] += 1

    graph = nx.Graph()
    for t, count in trigger_counter.items():
        graph.add_node(f"trigger::{t}", kind="trigger", label=trigger_labels[t], weight=count)
    for b, count in belief_counter.items():
        graph.add_node(f"belief::{b}", kind="belief", label=belief_labels[b], weight=count)
    for (t, b), count in pair_counter.items():
        graph.add_edge(f"trigger::{t}", f"belief::{b}", weight=count, is_loop=False, detection_count=0)

    for loop in _fetch_loop_edges(user_id):
        t = _clean_trigger(loop.get("trigger") or "")
        b = _clean_belief(loop.get("core_belief") or "")
        if not t or not b:
            continue
        t_id, b_id = f"trigger::{t}", f"belief::{b}"
        if not graph.has_node(t_id):
            graph.add_node(t_id, kind="trigger", label=loop.get("trigger") or t, weight=1)
        if not graph.has_node(b_id):
            graph.add_node(b_id, kind="belief", label=loop.get("core_belief") or b, weight=1)
        if not graph.has_edge(t_id, b_id):
            graph.add_edge(t_id, b_id, weight=0, is_loop=False, detection_count=0)
        edge = graph[t_id][b_id]
        edge["is_loop"] = True
        edge["detection_count"] = max(edge.get("detection_count", 0), int(loop.get("detection_count") or 0))
        edge["confidence"] = float(loop.get("confidence_score") or 0.0)

    graph.remove_nodes_from([n for n, d in graph.degree() if d == 0])

    loop_node_ids = {n for u, v, d in graph.edges(data=True) if d.get("is_loop") for n in (u, v)}
    low_frequency_nodes = [
        n for n, data in graph.nodes(data=True)
        if data["weight"] < MIN_NODE_FREQUENCY and n not in loop_node_ids
    ]
    graph.remove_nodes_from(low_frequency_nodes)
    graph.remove_nodes_from([n for n, d in graph.degree() if d == 0])

    if graph.number_of_nodes() == 0:
        return {"nodes": [], "edges": []}

    positions = _pack_components(graph)

    xs = [p[0] for p in positions.values()]
    ys = [p[1] for p in positions.values()]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    x_span = (x_max - x_min) or 1.0
    y_span = (y_max - y_min) or 1.0

    def _norm(v: float, lo: float, span: float) -> float:
        return round((v - lo) / span, 4)

    max_trigger_weight = max(trigger_counter.values(), default=1)
    max_belief_weight = max(belief_counter.values(), default=1)
    max_edge_weight = max((d["weight"] for _, _, d in graph.edges(data=True)), default=1) or 1

    nodes = []
    for node_id, data in graph.nodes(data=True):
        pos = positions[node_id]
        norm_weight = data["weight"] / (max_trigger_weight if data["kind"] == "trigger" else max_belief_weight)
        nodes.append({
            "id": node_id,
            "label": data["label"],
            "type": data["kind"],
            "frequency": data["weight"],
            "size": round(norm_weight, 4),
            "degree": graph.degree(node_id),
            "x": _norm(pos[0], x_min, x_span),
            "y": _norm(pos[1], y_min, y_span),
        })

    edges = []
    for source, target, data in graph.edges(data=True):
        edges.append({
            "source": source,
            "target": target,
            "weight": data["weight"],
            "strength": round(min(data["weight"] / max_edge_weight, 1.0), 4) if data["weight"] else 0.15,
            "is_loop": data.get("is_loop", False),
            "detection_count": data.get("detection_count", 0),
        })

    return {"nodes": nodes, "edges": edges}
