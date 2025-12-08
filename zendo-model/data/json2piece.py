from typing import Dict, List, Any


def scenejson_to_prolog_strings(scene: Dict[str, Any]) -> List[str]:
    """
    Konvertiert eine SceneJSON-Struktur aus dem Frontend in eine Liste von
    Prolog-Item-Strings im selben Format wie tensor_to_prolog_strings.

    Sie stellt zusätzlich sicher, dass keine zwei Items sich gegenseitig referenzieren.
    Beispiel:
      statt
        [item(0, ..., touching(1)), item(1, ..., touching(0))]
      wird
        [item(0, ..., touching(1)), item(1, ..., grounded)]
    erzeugt (d.h. nur der kleinere Index behält die Relation).
    """
    pieces: List[Dict[str, Any]] = scene.get("pieces", [])

    # 1) String-IDs aus dem Frontend auf numerische IDs mappen: 0..n-1
    id_to_idx: Dict[str, int] = {p["id"]: i for i, p in enumerate(pieces)}

    # Zwischenspeicher für alle Items, damit wir danach die wechselseitigen Referenzen
    # auflösen können.
    # Jedes Element ist ein Dict mit:
    #   color, shape, orientation, action (String),
    #   rel_verb (z.B. "touching", "pointing", "on_top_of" oder None),
    #   rel_target (Index oder None)
    items_meta: List[Dict[str, Any]] = [None] * len(pieces)

    # --------
    # 1. PASS: lokale Aktionen bestimmen
    # --------
    for p in pieces:
        idx = id_to_idx[p["id"]]

        color = p.get("color", "red")
        shape = p.get("shape", "block")
        orientation = p.get("orientation", "upright")

        # Spezialfall wie im Tensor-Code:
        # wedge + flat -> doorstop
        if shape == "wedge" and orientation == "flat":
            orientation = "doorstop"

        touching_left = p.get("touchingLeft")
        touching_right = p.get("touchingRight")
        on_top = p.get("onTop")
        below = p.get("below")
        pointing = p.get("pointing")

        # Default wie im Tensor-Code: grounded
        action = "grounded"
        rel_verb = None
        rel_target = None

        # Reihenfolge wie in tensor_to_prolog_strings:
        # 1) pointing
        # 2) on_top_of
        # 3) below (führt weiterhin zu "grounded")
        # 4) touching – wir haben hier nur left/right
        if pointing and pointing in id_to_idx:
            t = id_to_idx[pointing]
            action = f"pointing({t})"
            rel_verb = "pointing"
            rel_target = t
        elif on_top and on_top in id_to_idx:
            t = id_to_idx[on_top]
            action = f"on_top_of({t})"
            rel_verb = "on_top_of"
            rel_target = t
        elif below:
            # Im Tensor-Pendant wird bei 'below != PAD_REL' einfach grounded beibehalten
            action = "grounded"
            rel_verb = None
            rel_target = None
        else:
            # Touching – wir bevorzugen links, sonst rechts
            if touching_left and touching_left in id_to_idx:
                t = id_to_idx[touching_left]
                action = f"touching({t})"
                rel_verb = "touching"
                rel_target = t
            elif touching_right and touching_right in id_to_idx:
                t = id_to_idx[touching_right]
                action = f"touching({t})"
                rel_verb = "touching"
                rel_target = t

        items_meta[idx] = {
            "color": color,
            "shape": shape,
            "orientation": orientation,
            "action": action,
            "rel_verb": rel_verb,
            "rel_target": rel_target,
        }

    # --------
    # 2. PASS: wechselseitige Referenzen auflösen
    # --------
    # Wenn i -> j und j -> i, dann darf nur einer die Relation behalten.
    # Hier gewinnt deterministisch der kleinere Index.
    for i, meta_i in enumerate(items_meta):
        rel_verb_i = meta_i["rel_verb"]
        rel_target_i = meta_i["rel_target"]

        if rel_verb_i is None or rel_target_i is None:
            continue

        j = rel_target_i
        meta_j = items_meta[j]
        rel_verb_j = meta_j["rel_verb"]
        rel_target_j = meta_j["rel_target"]

        # Prüfe auf 2-Zyklus (unabhängig vom Verb-Typ)
        if rel_verb_j is not None and rel_target_j == i:
            # Beide referenzieren sich gegenseitig
            # -> Der mit dem größeren Index wird auf grounded gesetzt
            if i > j:
                meta_i["action"] = "grounded"
                meta_i["rel_verb"] = None
                meta_i["rel_target"] = None
            # Falls i < j, behalten wir i->j und lassen j in der eigenen Schleife
            # auf grounded setzen (es gilt dann i < j und j > i).

    # --------
    # 3. PASS: Prolog-Strings bauen
    # --------
    prolog_items: List[str] = []
    for idx, meta in enumerate(items_meta):
        item_str = (
            f"item({idx}, {meta['color']}, {meta['shape']}, "
            f"{meta['orientation']}, {meta['action']})"
        )
        prolog_items.append(item_str)

    return prolog_items
