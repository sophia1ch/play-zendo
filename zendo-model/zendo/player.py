from dataclasses import field
import json
from pathlib import Path
import subprocess
from typing import Any, Optional
from call_vision_model import call_vision_model
from data.create_programs import convert_prolog_to_dsl
from data.create_prolog import dsl_to_prolog
from data.pieces2tensor import prolog_strings_to_tensor
from data.tensor2piece import tensor_to_prolog_strings
from data.json2piece import scenejson_to_prolog_strings
from experiment_helper import task_set2zendodataset
from experiments.run_experiment import canonicalize_program, gather_data, normalize_program_structure
import random
import re
from generation.render import render_scene
from grammar import dsl
from program import strip_trailing_var0
import torch
import time
from collections import Counter
import math
from openai import OpenAI
import ast
import base64
import mimetypes
import numpy as np

from type_system import BOOL, Arrow, List

def load_api_key(path="./model/api.key"):
    with open(path, "r") as f:
        return f.read().strip()

def normalize_rule(rule):
    strip_trailing_var0(rule)
    norm_rule = normalize_program_structure(rule)
    canonical_rule = canonicalize_program(norm_rule)
    return str(canonical_rule)

PREDICATE_TO_IDX_VAL = {
    "IS_RED":       (1, 0),
    "IS_BLUE":      (1, 1),
    "IS_YELLOW":    (1, 2),
    "IS_BLOCK":     (2, 0),
    "IS_WEDGE":     (2, 1),
    "IS_PYRAMID":   (2, 2),
    "IS_UPRIGHT":   (3, 0),
    "IS_UPSIDE_DOWN": (3, 1),
    "IS_FLAT":        (3, 2),
    "IS_CHEESECAKE":  (3, 3),
    "IS_HORIZONTAL":  (3, 2),
    "IS_VERTICAL":    (3, 0),
}

AMOUNT_PREDICATES = ["EVEN", "ODD", "EITHER_OR"]

def extract_predicates(program_str):
    preds = [word.rstrip(')') for word in program_str.split() if word.startswith("IS_")]
    if preds:
        return preds
    # If no IS_ predicates, extract the first word after '('
    match = re.search(r'\(\s*(\w+)', program_str)
    if match:
        return [match.group(1)]
    return []

def parse_either_or_args(rule_str: str):
    """
    Extracts the two integer values from an EITHER_OR rule like:
    (EITHER_OR 2 3 var0)
    Returns (2, 3)
    """
    match = re.search(r'\(EITHER_OR\s+(\d+)\s+(\d+)', rule_str)
    if match:
        return int(match.group(1)), int(match.group(2))
    return None, None

def call_prolog_subprocess_with_retries(n, query, prolog_file, retries=10, delay=2):
    """
    Calls the Prolog subprocess to generate a scene, with retry mechanism on failure.

    :param n: Number of examples to generate
    :param query: Prolog query string
    :param prolog_file: Path to the Prolog file
    :param retries: Number of retry attempts
    :param delay: Delay between retries in seconds
    :return: JSON-parsed result or None
    """
    for attempt in range(retries):
        try:
            abs_path = Path(prolog_file).resolve().as_posix()
            result = subprocess.check_output(
                ['python3', 'call_generate_prolog.py', str(n), query, abs_path],
                timeout=6,
                stderr=subprocess.STDOUT  # capture stderr too
            )
            return json.loads(result)
        except subprocess.TimeoutExpired:
            print(f"Timeout on attempt {attempt + 1}/{retries}")
        except subprocess.CalledProcessError as e:
            print(f"Subprocess failed on attempt {attempt + 1}/{retries}:\n", e.output.decode())
        except json.JSONDecodeError as e:
            print(f"JSON decode failed on attempt {attempt + 1}/{retries}:", e)
        except Exception as e:
            print(f"Unexpected error on attempt {attempt + 1}/{retries}:", e)

        if attempt < retries - 1:
            time.sleep(delay)

    print("All retry attempts failed.", query)
    return None

class ZendoPlayerInterface:
    def __init__(self, player_id, cfg, dsl, model=None):
        self.player_id = player_id

    def observe(self, example, description): ...
    def guess_rule(self): ...
    def guess_label(self, input_scene): ...
    def propose_input(self): ...
    def quiz_correct(self): ...
    def quiz_incorrect(self): ...
    def system_message(self, message): ...

def png_path_to_data_url(path: Path) -> Optional[str]:
    try:
        data = path.read_bytes()
    except FileNotFoundError:
        return None
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:image/png;base64,{b64}"


class HumanPlayer(ZendoPlayerInterface):

    def __init__(
        self,
        player_id: int,
        task_idx: int,
        send_event: any,
        wait_for_action: any,
        cfg: Any = None,
        dsl: Any = None,
        model: Any = None,
    ):
        super().__init__(player_id=player_id, cfg=cfg, dsl=dsl, model=model)
        self.id = player_id  # step() erwartet p.id
        self.task_idx = task_idx
        self._send_event = send_event
        self._wait_for_action = wait_for_action
        self.cfg = cfg

        self.examples: list[Any] = []
        self.guessing_stones: int = 0

        self._pending_label_guess: Optional[bool] = None
        self.previous_guesses = []
        self.incorrect_rules = []
        self.others_guessing_stones: dict[int, int] = {}
        self.last_label = None

    def observe(self, example, description=None):
        self.examples.append(example)

        (tensor_and_label, path) = example
        _, label = tensor_and_label

        label_str = "YES" if bool(label) else "NO"

        image_data_url = None
        if path:
            p = Path(path)
            if p.exists():
                image_data_url = png_path_to_data_url(p)

        payload = {
            "type": "labeled_example",
            "label": label_str,
            "imageDataUrl": image_data_url,
            "description": description,
        }
        print(f"HumanPlayer {self.id} observed example with label {label_str}")
        self._send_event(payload)

    def update_others_guessing_stones(self, player_id: int, stones: int):
        print(f"HumanPlayer {self.id} updating stones for player {player_id} to {stones}")
        payload = {
            "type": "update_other_player_stones",
            "playerId": player_id,
            "stones": int(stones),
        }
        self._send_event(payload)

    def quiz_correct(self):
        self.guessing_stones += 1
        self._send_event({
            "type": "quiz_result",
            "correct": True,
            "stones": int(self.guessing_stones),
            "playerId": self.id,
        })

    def quiz_incorrect(self):
        self._send_event({
            "type": "quiz_result",
            "correct": False,
            "stones": int(self.guessing_stones),
            "playerId": self.id,
        })
    
    def system_message(self, message):
        print(f"System message for HumanPlayer {self.id}: {message}")
        self._send_event({
            "type": "game_system_message",
            "text": message,
        })

    def guess_rule(self):
        """
        Optional: Wenn du später willst, dass der HumanPlayer Regeln eingibt,
        kannst du hier analog zu react() mit dem Frontend sprechen.
        Für jetzt: keine Regelraten.
        """
        return None

    def decide_guess(self, state):
        self._send_event({
            "type": "guess_rule_prompt"
        })
        msg = self._wait_for_action("guess_rule")

        want = bool(msg.get("wantGuess", False))
        if not want:
            return None

        rule_str = msg.get("rule")
        if not rule_str or not isinstance(rule_str, str):
            return None
        try:
            rule = convert_prolog_to_dsl(rule_str, self.cfg)
        except Exception as e:
            print("ERROR converting Prolog to DSL:", e)
            return None

        return {"type": "guess_rule", "rule": rule}
    
    def wrong_rule(self, rule):
        """
        Called when the player guesses a rule that is incorrect.
        Adds the rule to the list of incorrect rules.
        """
        print("HumanPlayer guessed wrong rule:", rule)
        if rule not in self.incorrect_rules:
            self.incorrect_rules.append(normalize_rule(rule))
        self._send_event({
            "type": "rule_incorrect",
            "rule": str(rule),
        })
        return
        

    def guess_label(self, input_scene):
        """
        Wird in QUIZ-Phase aufgerufen, wenn der Spieler ein Label raten soll.

        Flow:
        - Wenn der User schon in react() (bei Quiz) ein Label angegeben hat,
          benutzen wir dieses (_pending_label_guess).
        - Sonst fragen wir explizit nochmal das Frontend.
        """
        if self._pending_label_guess is not None:
            label = self._pending_label_guess
            self._pending_label_guess = None
            return label

        _, path = input_scene
        image_data_url = None
        if path:
            image_data_url = png_path_to_data_url(Path(path))

        self._send_event({
            "type": "human_guess_label_request",
            "imageDataUrl": image_data_url,
            "playerId": self.id,
        })

        action = self._wait_for_action("guess_label")
        label_str = action.get("label", "NO")
        return label_str == "YES"

    def react(self, state):
        while True:
            self._send_event({
                "type": "human_propose_request",
                "playerId": self.id,
                "examplesCount": len(self.examples),
            })

            built = self._wait_for_action("scene_built")
            scene_json = built.get("scene")

            if scene_json is None:
                return {"type": "propose_input", "input": None, "mode": "TELL"}
            prolog_scene = scenejson_to_prolog_strings(scene_json)

            # Tensor für das Zendo-System
            try:
                tensor = prolog_strings_to_tensor([prolog_scene])[0]
            except Exception as e:
                print("ERROR converting SceneJSON to tensor:", e)
                return {"type": "propose_input", "input": None, "mode": "TELL"}
            candidate_path = Path(str(self.task_idx)) / Path(str(self.id)) / str(len(self.examples))
            full_input_path = Path("generation") / Path("output") / (str(candidate_path) + ".png")

            try:
                tensor = render_scene(prolog_scene, path=candidate_path)
            except Exception as e:
                print("ERROR rendering scene:", e)
                full_input_path = Path("")

            image_data_url = None
            if full_input_path and full_input_path.exists():
                image_data_url = png_path_to_data_url(full_input_path)

            # Check if image is wanted by user
            self._send_event({
                "type": "human_scene_preview",
                "playerId": self.id,
                "scene": scene_json,
                "imageDataUrl": image_data_url,
                # könnte man hier auch schon "gm_label" hinzufügen, wenn du willst
            })

            # expected response:
            # {
            #   "type": "human_propose_decision",
            #   "action": "retry" | "submit",
            #   "mode": "QUIZ" | "TELL",
            # }
            decision = self._wait_for_action("scene_decision")
            action_type = decision.get("action", "submit")

            if action_type == "retry":
                continue

            mode = decision.get("mode", "TELL")

            action = {
                "type": "propose_input",
                "input": (tensor, str(full_input_path)),
                "mode": mode,   # "QUIZ" oder "TELL"
                "rule": None,   # HumanPlayer gibt hier keine Regel mit
            }
            return action

class ZendoPlayer:
    def __init__(self, player_id, task_idx, model, dsl, cfg, bar=5e-7, prefer_valid=True, min_examples=7, images=True, gs_threshold=0, vision_model=None):
        self.id = player_id
        self.examples = []  # List[(tensor, label)]
        self.model = model
        self.dsl = dsl
        self.cfg = cfg
        self.pad_values = [7, 3, 3, 4, 7, 7, 7, 7, 7, 7, 7]
        self.guessing_stones = 0
        self.bar = bar  # Threshold for rule probability to consider it valid
        self.incorrect_rules = []
        self.previous_guesses = []
        self.task_idx = task_idx
        self.use_model = model is not None
        self.prefer_valid = prefer_valid
        self.min_examples = min_examples
        self.create_images = images
        self.last_label = None  # Store the last label proposed by GPT
        self.gs_threshold = gs_threshold
        self.top_guess = None
        self.vision_model = vision_model
        self.others_guessing_stones: dict[int, int] = {}

    def system_message(self, message):
        print(f"System message for Player {self.id}: {message}")
        
    def observe(self, example, description=None):
        if example[0][0] is None:
            image_tensor = call_vision_model(self.vision_model, example[1])
            example = ((image_tensor, example[0][1]), example[1])
        self.examples.append(example)

    def update_others_guessing_stones(self, player_id: int, stones: int):
        self.others_guessing_stones[player_id] = stones

    def wrong_rule(self, rule):
        """
        Called when the player guesses a rule that is incorrect.
        Adds the rule to the list of incorrect rules.
        """
        if rule not in self.incorrect_rules:
            self.incorrect_rules.append(normalize_rule(rule))
        self.top_guess = None

    def quiz_correct(self):
        self.guessing_stones += 1
    
    def quiz_incorrect(self):
        self.top_guess = None

    def guess_label(self, input_scene):
        if self.last_label is not None:
            label = self.last_label
            self.last_label = None  # Reset after use
            return label
        examples, _ = zip(*self.examples)
        dataset = task_set2zendodataset([["", examples]], self.model, self.dsl, self.cfg, use_model=self.use_model)
        data = []
        for t in range(len(examples)):
            required_accuracy = 1- (t/len(examples))
            print(f"Gathering data for accuracy {required_accuracy:.2f}...")
            data = gather_data(dataset, 0, accuracy=required_accuracy, incorrect_rules=self.incorrect_rules)
            if data[0][1] != [(None, 0.0, 0.0, 0, 0.0, 0.0, 0.0)]:
                break
        top_rule = data[0][1][0][0]
        try:
            top_rule = strip_trailing_var0(top_rule)
            prog_fn = top_rule.eval(dsl=self.dsl, environment=(None, None), i=0)
            self.top_guess = top_rule
            return prog_fn(input_scene[0])
        except Exception as e:
            print(f"Error evaluating rule {top_rule}: {e}")
            top_rule = data[0][1][1][0]
            try:
                top_rule = strip_trailing_var0(top_rule)
                prog_fn = top_rule.eval(dsl=self.dsl, environment=(None, None), i=0)
                self.top_guess = top_rule
                return prog_fn(input_scene[0])
            except Exception as e:
                print(f"Error evaluating rule {top_rule} again: {e}")
                return False
            
    def guess_labels(self, input_paths):
        input_scenes = []
        for input_path in input_paths:
            image_tensor = call_vision_model(self.vision_model, input_path)
            input_scenes.append(image_tensor)
        examples, _ = zip(*self.examples)
        dataset = task_set2zendodataset([["", examples]], self.model, self.dsl, self.cfg, use_model=self.use_model)
        data = []
        for t in range(len(examples)):
            required_accuracy = 1- (t/len(examples))
            print(f"Gathering data for accuracy {required_accuracy:.2f}...")
            data = gather_data(dataset, 0, accuracy=required_accuracy, incorrect_rules=self.incorrect_rules)
            if data[0][1] != [(None, 0.0, 0.0, 0, 0.0, 0.0, 0.0)]:
                break
        top_rule = data[0][1][0][0]
        labels = []
        for input_scene in input_scenes:
            try:
                top_rule = strip_trailing_var0(top_rule)
                prog_fn = top_rule.eval(dsl=self.dsl, environment=(None, None), i=0)
                labels.append(prog_fn(input_scene))
            except Exception as e:
                print(f"Error evaluating rule {top_rule}: {e}")
                top_rule = data[0][1][1][0]
                try:
                    top_rule = strip_trailing_var0(top_rule)
                    prog_fn = top_rule.eval(dsl=self.dsl, environment=(None, None), i=0)
                    labels.append(prog_fn(input_scene))
                except Exception as e:
                    print(f"Error evaluating rule {top_rule} again: {e}")
                    labels.append(False)
        
        return labels, top_rule

    def decide_guess(self, state):
        if self.guessing_stones <= 0 or len(self.examples) < self.min_examples:
            return None
        rule = self.guess_rule()
        if rule is None:
            print(f"Player {self.id} could not find a rule")
            return None
        self.guessing_stones -= 1
        print(f"Player {self.id} guessed rule: {rule}")
        return {"type": "guess_rule", "rule": rule}

    def guess_rule(self):
        if self.top_guess != None:
            guess = self.top_guess
            self.top_guess = None
            return guess
        examples, _ = zip(*self.examples)
        dataset = task_set2zendodataset([["", examples]], self.model, self.dsl, self.cfg, use_model=self.use_model)
        data = []
        for t in range(len(examples)):
            required_accuracy = 1 - (t/len(examples))
            print(f"Gathering data for accuracy {required_accuracy:.2f}...")
            data = gather_data(dataset, 0, accuracy=required_accuracy, incorrect_rules=self.incorrect_rules)
            if data[0][1] != [(None, 0.0, 0.0, 0, 0.0, 0.0, 0.0)]:
                break
        candidate_rule, *_, prob = data[0][1][0]
        if candidate_rule is None:
            data = []
            for t in range(len(examples)):
                required_accuracy = 1 - (t/len(examples))
                print(f"Gathering data for accuracy {required_accuracy:.2f}...")
                data = gather_data(dataset, 0, accuracy=required_accuracy, incorrect_rules=self.incorrect_rules)
                if data[0][1] != [(None, 0.0, 0.0, 0, 0.0, 0.0, 0.0)]:
                    break
                candidate_rule, *_, prob = data[0][1][0]
        if candidate_rule is None:
            print(f"Player {self.id} could not find any valid rule in the dataset.")
            return None
        if prob > self.bar:
            return candidate_rule
        return None
    
    def react(self, state):
        # Only called during PROPOSE phase
        proposed_input, path, label, rule = self.propose_input()
        self.last_label = label
        amount_players = len(state.player_guess_tokens)
        if proposed_input is None:
            print("Failed to propose input, returning None.")
            return {"type": "propose_input", "input": None, "mode": "TELL"}
        mode = "QUIZ" if (label is not None and self.guessing_stones <= self.gs_threshold) or amount_players == 1  else "TELL"
        return {"type": "propose_input", "input": (proposed_input, path), "mode": mode, "rule": rule}

    def propose_input(self):
        print(f"Proposing input based on {len(self.examples)} current examples...")
        examples, _ = zip(*self.examples)
        dataset = task_set2zendodataset([["", examples]], self.model, self.dsl, self.cfg, use_model=self.use_model)
        data = []
        for t in range(len(examples)):
            required_accuracy = 1 - (t/len(examples))
            print(f"Gathering data for accuracy {required_accuracy:.2f}...")
            data = gather_data(dataset, 0, accuracy=required_accuracy, incorrect_rules=self.incorrect_rules)
            if data[0][1] != [(None, 0.0, 0.0, 0, 0.0, 0.0, 0.0)]:
                break
        candidates = data[0][1]

        valid_candidates = [
            (prog, prob)
            for prog, *_, prob in candidates
            if normalize_rule(prog) not in self.incorrect_rules
        ]
        print(f"Valid candidates found: {valid_candidates}")
        if not valid_candidates:
            print("All candidate rules are in wrong_rules.")
            return None, None, None, None

        candidate_path = Path(str(self.task_idx)) / Path(str(self.id)) / str(len(self.examples))
        full_input_path = Path("generation") / Path("output") / (str(candidate_path) + ".png")
        top_rule, _ = valid_candidates[0]
        self.top_guess = top_rule
        validity_order = [("valid", True), ("invalid", False)] if self.prefer_valid else [("invalid", False), ("valid", True)]

        if len(valid_candidates) == 1:
            inner_query = dsl_to_prolog(top_rule)
            for validity, label in validity_order:
                prolog_str = f"generate_{validity}_structure([{inner_query}], Structure)"
                scene = call_prolog_subprocess_with_retries(1, prolog_str, "rules/rules.pl")[0]
                if scene is not None:
                    try:
                        if self.create_images:
                            full_input_path = Path("generation") / Path("output") / (str(candidate_path) + ".png")
                            for _ in range(3):
                                new_input = render_scene(scene, path=candidate_path)
                                if new_input is not None:
                                    return new_input, full_input_path, label, str(top_rule)
                            new_input = render_scene(scene, path=candidate_path)
                            return new_input, full_input_path, label, str(top_rule)
                        else:
                            new_input = prolog_strings_to_tensor([scene])[0]
                            return new_input, "", label, str(top_rule)
                    except Exception as e:
                        print(f"Failed to convert Prolog {validity} scene to tensor:", e)
                        return None, None, None, None
            print("Failed to generate both valid and invalid scenes.")
            return None, None, None, None

        inner_query = dsl_to_prolog(top_rule)

        for i, (validity, label) in enumerate(validity_order):
            print(f"Trying to generate a '{validity}' scene...")
            try:
                for j in range(30):
                    prolog_str = f"generate_{validity}_structure([{inner_query}], Structure)"
                    scene = call_prolog_subprocess_with_retries(1, prolog_str, "rules/rules.pl")[0]
                    if scene is None:
                        print("Prolog returned None for scene generation.")
                        continue

                    try:
                        proposed_input = prolog_strings_to_tensor([scene])[0]
                    except Exception as e:
                        print("Failed to convert scene:", e)
                        return None, None, None, None

                    eval_results = []
                    for prog, _ in valid_candidates:
                        try:
                            strip_trailing_var0(prog)
                            prog_fn = prog.eval(dsl=self.dsl, environment=(None, None), i=0)
                            eval_results.append(prog_fn(proposed_input))
                        except Exception as e:
                            print("Evaluation error:", e)
                            eval_results.append(False)

                    counts = Counter(eval_results)
                    _, most_common_count = counts.most_common(1)[0]
                    num_disagreeing = len(eval_results) - most_common_count

                    if len(valid_candidates) > 3 and num_disagreeing >= len(valid_candidates) // 2 - 1:
                        print(f"Discriminating input found: {num_disagreeing} disagreements out of {len(valid_candidates)}")
                        if self.create_images:
                            full_input_path = Path("generation") / Path("output") / (str(candidate_path) + ".png")
                            new_input = render_scene(scene, path=candidate_path)
                            if new_input is not None:
                                return new_input, full_input_path, label , str(top_rule)
                        else:
                            return proposed_input, "", label, str(top_rule)

                    elif len(valid_candidates) <= 3 and num_disagreeing >= 1:
                        print("Input distinguishes among small candidate set.")
                        if self.create_images:
                            full_input_path = Path("generation") / Path("output") / (str(candidate_path) + ".png")
                            new_input = render_scene(scene, path=candidate_path)
                            if new_input is not None:
                                return new_input, full_input_path, label, str(top_rule)
                        else:
                            return proposed_input, "", label, str(top_rule)
                    elif i == 1 and j == 29:
                        print(f"Failed to find a discriminating input after 30 attempts for {validity} scene. Returning last attempt.")
                        if self.create_images:
                            full_input_path = Path("generation") / Path("output") / (str(candidate_path) + ".png")
                            new_input = render_scene(scene, path=candidate_path)
                            if new_input is not None:
                                return new_input, full_input_path, label, str(top_rule)
                        else:
                            return proposed_input, "", label, str(top_rule)

            except Exception as e:
                print("Exception during input generation:", e)
                return None, None, None, None

        print("No discriminating input found from either validity. Falling back...")
        return None, None, None, None

COLOR_IDX = 1
SHAPE_IDX = 2
ORIENT_IDX = 3
max_values = {
    COLOR_IDX: 3,  # red, blue, yellow
    SHAPE_IDX: 3,  # block, wedge, pyramid
    ORIENT_IDX: 4,  # upright, upside_down, flat, cheesecake
}

def random_piece_like(piece: torch.Tensor) -> torch.Tensor:
    """Return a modified copy of `piece` with one attribute changed to a different valid value."""
    attr_idx = random.choice([COLOR_IDX, SHAPE_IDX, ORIENT_IDX])
    current_val = int(piece[attr_idx].item())
    candidates = [v for v in range(max_values[attr_idx]) if v != current_val]
    new_val = random.choice(candidates)
    
    new_piece = piece.clone()
    new_piece[attr_idx] = new_val
    return new_piece

class HeuristicZendoPlayer(ZendoPlayer):
    PAD_VALS = torch.tensor([7, 3, 3, 4, 7, 7, 7, 7, 7, 7, 7, -1, -1, -1, -1], dtype=torch.int64)

    def is_padding(self, piece):
        return torch.all(piece == self.PAD_VALS)
    
    def non_padded_indices(self, structure):
        return [i for i, p in enumerate(structure) if not self.is_padding(p)]
    
    def react(self, state):
        proposed_input, path = self.propose_input()
        if proposed_input is None:
            print("Failed to propose input, returning None.")
            return {"type": "propose_input", "input": None, "mode": "TELL"}
        mode = "QUIZ"
        return {"type": "propose_input", "input": (proposed_input, path), "mode": mode}
    

    def ensure_size(self, structure: torch.Tensor) -> torch.Tensor:
        """
        Ensures the structure has shape (7, 15).
        If it has fewer columns (e.g., 11), pads with -1.
        """
        rows, target_cols = 7, 15
        current_cols = structure.size(1)

        if current_cols < target_cols:
            pad_cols = target_cols - current_cols
            pad_tensor = torch.full((rows, pad_cols), -1, dtype=structure.dtype, device=structure.device)
            structure = torch.cat([structure, pad_tensor], dim=1)

        return structure

    def propose_input(self, max_attempts=15):
        for _ in range(max_attempts):
            examples, _ = zip(*self.examples)
            print(f"Proposing input based on {len(examples)} current examples...")
            base_structure, _ = random.choice(examples)
            base_structure = self.ensure_size(base_structure)
            mutation = random.choice(self.heuristics)
            new_input = mutation(base_structure)
            duplicate = any(
                (new_input.shape == ex.shape) and torch.equal(new_input, ex)
                for (ex, _) in examples
            )

            if duplicate or new_input is None:
                print(f"Heuristic Player proposed a duplicate structure, retrying...")
                continue
            else:
                if self.create_images:
                    candidate_path = Path(str(self.task_idx)) / Path(str(self.id)) / str(len(self.examples))
                    full_input_path = Path("generation") / Path("output") / (str(candidate_path) + ".png")
                    new_input_rendered = render_scene(tensor_to_prolog_strings([new_input])[0], path=candidate_path)
                    if new_input_rendered is not None:
                        return new_input_rendered, full_input_path
                else:
                    return new_input, ""
        return None, ""

    def reduce_by_one(self, structure):
        structure = structure.clone()
        indices = self.non_padded_indices(structure)
        if len(indices) <= 1:
            return structure
        idx_to_remove = random.choice(indices)
        structure = torch.cat([structure[:idx_to_remove], structure[idx_to_remove+1:], self.PAD_VALS.unsqueeze(0)], dim=0)
        return structure

    def substitute_one_piece(self, structure):
        structure = structure.clone()
        indices = self.non_padded_indices(structure)
        if not indices:
            return structure
        i = random.choice(indices)
        new_piece = self.random_piece_like(structure[i])
        structure[i] = new_piece
        return structure

    def homogenize_attribute(self, structure):
        structure = structure.clone()
        indices = self.non_padded_indices(structure)
        if not indices:
            return structure
        attr_idx = random.choice([COLOR_IDX, SHAPE_IDX, ORIENT_IDX])
        val = random.choice([int(structure[i][attr_idx].item()) for i in indices])
        if val == 3:
            val = 2
        for i in indices:
            structure[i][attr_idx] = val
        return structure
    
    def single_piece_structure(self, structure):
        structure = structure.clone()
        N, D = structure.shape
        indices = self.non_padded_indices(structure)
        if not indices:
            return structure

        i = random.choice(indices)
        selected_piece = structure[i].clone()
        if D >= 11:
            selected_piece[4:11] = 8
            if D > 11:
                selected_piece[11:] = -1
        else:
            selected_piece[4:] = 8

        padding = self.PAD_VALS.unsqueeze(0).repeat(6, 1)
        new_structure = torch.cat([selected_piece.unsqueeze(0), padding], dim=0)
        return new_structure
    
    def spread_structure(self, structure):
        structure = structure.clone()
        indices = self.non_padded_indices(structure)
        for i in indices:
            structure[i][4:11] = 8
        return structure

    def random_piece_like(self, piece: torch.Tensor) -> torch.Tensor:
        new_piece = None
        while new_piece is None or torch.equal(new_piece, piece):
            attr_idx = random.choice([COLOR_IDX, SHAPE_IDX, ORIENT_IDX])
            current_val = int(piece[attr_idx].item())
            max_values = {
                COLOR_IDX: 3,
                SHAPE_IDX: 3,
                ORIENT_IDX: 4
            }
            candidates = [v for v in range(max_values[attr_idx]) if v != current_val]
            new_val = random.choice(candidates)
            new_piece = piece.clone()
            new_piece[attr_idx] = new_val
            if new_piece[2] != 1 and new_piece[3] == 3:
                new_piece = None
                continue
        return new_piece

    @property
    def heuristics(self):
        return [
            self.reduce_by_one,
            self.substitute_one_piece,
            self.homogenize_attribute,
            self.single_piece_structure,
            self.spread_structure
        ]

class GPTQueryZendoPlayer(HeuristicZendoPlayer):
    def _normalize_item_str(self, s: str) -> str:
        # normalize whitespace + case to compare strings robustly
        return re.sub(r'\s+', '', s.strip().lower())

    def _canonicalize_items(self, items: list[str]) -> tuple[str, ...]:
        # sort normalized strings so item list order doesn’t matter
        return tuple(sorted(self._normalize_item_str(x) for x in items))


    def react(self, state):
        # Only called during PROPOSE phase
        proposed_input, rule, path = self.propose_input()
        if proposed_input is None:
            print("Failed to propose input, returning None.")
            return {"type": "propose_input", "input": None, "mode": "TELL"}
        return {"type": "propose_input", "input": (proposed_input, path), "mode": "QUIZ", "rule": rule}

    def build_zendo_prompt_from_examples(self, examples, top_rules):
        # Separate tensors and labels
        tensors = [t for t, _ in examples]
        labels = [l for _, l in examples]

        # Convert tensors to prolog strings
        structure_strs = tensor_to_prolog_strings(tensors)

        # Format examples
        formatted = []
        for label, items in zip(labels, structure_strs):
            formatted.append((label, str(items)))

        positives = [s for l, s in formatted if l == 1]
        negatives = [s for l, s in formatted if l == 0]
        top_rules_str = "\n".join(map(str, top_rules))
        prompt = f"""You are a Zendo player. Your job is to generate a new structure example to gain new knowledge about the hidden rule.
You are given a few positive and negative examples. Each structure consists of a list of items with the format:
"item(ID, color, shape, orientation, interaction)".

The pieces can have colors: red, blue, yellow; shapes: block, wedge, pyramid; orientations: upright, upside_down, flat, cheesecake, doorstop.
Wedges are never flat but instead can be doorstop or cheesecake, while the two other shapes can be flat but not cheesecake or doorstop.
Interactions can be: grounded, touching(ID), pointing(ID) and on_top_of(ID), where ID is the first field of another piece, e.g. "pointing(2)" means this piece is pointing to the piece with ID 2.

The current top rule hypotheses are:
{top_rules_str}

Positive examples:
{chr(10).join(positives)}

Negative examples:
{chr(10).join(negatives)}

Please ONLY return a new example and its label within a python block, in this exact format, where label is 1 for valid and 0 for invalid:
```python
[["item(ID, color, shape, orientation, interaction)", ...], label]
```
"""
        return prompt

    def query_gpt_for_structure(self, prompt):
        print("Querying GPT-4o for structure generation...")
        api_key = load_api_key()
        client = OpenAI(api_key=api_key)
        try:
            print("Querying GPT-4o for structure generation...", prompt)
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[{
                    "role": "user",
                    "content": prompt
                }],
                max_tokens=1500,
            )
            response_text = response.choices[0].message.content
            lines = response_text.splitlines()
            # response = client.responses.create(
            #     model="gpt-5",
            #     input=prompt,
            #     reasoning={ "effort": "low" },
            #     text={ "verbosity": "low" },
            # )
            # response_text = getattr(response, "output_text", None)
            # if not response_text:
            #     # structured shape: output -> [message] -> content -> [output_text]
            #     response_text = response.output[0].content[0].text
            # lines = response_text.splitlines()
            lines = [line for line in lines if not line.strip().startswith("#")]
            response_text = "\n".join(lines).strip()
            if response_text.startswith("```python"):
                response_text = response_text.strip("`").split("python", 1)[-1].strip()
            if response_text.endswith("```"):
                response_text = response_text.rsplit("```", 1)[0].strip()
            print("GPT-4o response:", response_text, type(response_text))
            if not isinstance(response_text, str):
                print("GPT-4o response is not a string.")
                return None  # (tensor, items)
            try:
                parsed = ast.literal_eval(response_text)
            except Exception as e:
                print("Failed to parse response using ast.literal_eval:", e)
                return None

            if not isinstance(parsed, list) or len(parsed) != 2:
                print("Unexpected format. Expected: [[item strings...], label]")
                return None

            items, label = parsed
            if not isinstance(items, list) or not all(isinstance(s, str) for s in items):
                print("Invalid item list.")
                return None
            input_tensor = prolog_strings_to_tensor([items])[0]
            print("GPT-4o response:", response_text, "Parsed tensor:", input_tensor)
            if input_tensor is None:
                print("Failed to parse GPT-4o response into tensor.")
                return None
            else:
                print("GPT-4o response successfully parsed into tensor.")
                return input_tensor
        except Exception as e:
            print("Failed to parse response. Raw text:\n", response)
            print("Error:", e)
            return None

    def propose_input(self, max_retries: int = 10):
        print(f"Proposing input based on {len(self.examples)} current examples...")
        examples, _ = zip(*self.examples)
        dataset = task_set2zendodataset([["", examples]], self.model, self.dsl, self.cfg, use_model=self.use_model)
        data = []
        for t in range(len(examples)):
            required_accuracy = 1- (t/len(examples))
            data = gather_data(dataset, 0, accuracy=required_accuracy, incorrect_rules=self.incorrect_rules)
            if data[0][1] != [(None, 0.0, 0.0, 0, 0.0, 0.0, 0.0)]:
                break
        candidates = data[0][1]

        valid_candidates = [
            prog
            for prog, *_ in candidates
            if normalize_rule(prog) not in self.incorrect_rules
        ]
        prompt = self.build_zendo_prompt_from_examples(examples, valid_candidates[:2])
        for attempt in range(1, max_retries + 1):
            structure = self.query_gpt_for_structure(prompt)
            if structure is None:
                print(f"Attempt {attempt}: GPT failed to produce a valid structure.")
                continue

            duplicate = any(
                (structure.shape == ex.shape) and torch.equal(structure, ex)
                for (ex, _) in examples
            )

            if duplicate:
                print(f"Attempt {attempt}: GPT proposed a duplicate structure, retrying...")
                continue

            if self.create_images:
                candidate_path = Path(str(self.task_idx)) / Path(str(self.id)) / str(len(self.examples))
                full_input_path = Path("generation") / Path("output") / (str(candidate_path) + ".png")
                new_input_rendered = render_scene(tensor_to_prolog_strings([structure])[0], path=candidate_path)
                if new_input_rendered is not None:
                    print(f"Novel structure generated on attempt {attempt}.")
                    return new_input_rendered, str(valid_candidates[0]), full_input_path
                else:
                    print(f"Attempt {attempt}: Failed to render structure to image.")
                    continue
            else:
                print(f"Novel structure generated on attempt {attempt}.")
                return structure, str(valid_candidates[0]), ""

        print("Failed to generate a novel structure after retries.")
        return None, None, ""
        
class FullGPTZendoPlayer(GPTQueryZendoPlayer):
    def __init__(self, player_id, task_idx, model, dsl, cfg, bar=5e-7, prefer_valid=True, min_examples=7, images=True, gs_threshold=0, vision_model=None):
        self.id = player_id
        self.examples = []
        self.model = model
        self.dsl = dsl
        self.cfg = cfg
        self.pad_values = [7, 3, 3, 4, 7, 7, 7, 7, 7, 7, 7]
        self.guessing_stones = 0
        self.bar = bar
        self.incorrect_rules = []
        self.task_idx = task_idx
        self.use_model = model is not None
        self.last_label = None
        self.previous_guesses = []
        self.min_examples = min_examples
        self.create_images = images
        self.gs_threshold = gs_threshold
        self.vision_model = vision_model

    def react(self, state):
        proposed_input, label, path = self.propose_input()
        self.last_label = label
        if proposed_input is None:
            print("Failed to propose input, returning None.")
            return {"type": "propose_input", "input": None, "mode": "TELL"}
        return {"type": "propose_input", "input": (proposed_input, path), "mode": "QUIZ"}
    
    def query_gpt_for_structure(self, prompt, message):
        print("Querying GPT-4o for structure generation...")
        api_key = load_api_key()
        client = OpenAI(api_key=api_key)
        try:
            print("Querying GPT-4o for structure generation...", prompt)
            # response = client.chat.completions.create(
            #     model="gpt-4o",
            #     messages=[{
            #         "role": "user",
            #         "content": prompt
            #     }],
            #     max_tokens=1500,
            # )
            # response_text = response.choices[0].message.content
            # lines = response_text.splitlines()
            if message:
                response = client.responses.create(
                    model="gpt-5",
                    input=[message],
                )
            else:
                response = client.responses.create(
                    model="gpt-5",
                    input=prompt,
                    reasoning={ "effort": "low" },
                    text={ "verbosity": "low" },
                )
            response_text = getattr(response, "output_text", None)
            if not response_text:
                # structured shape: output -> [message] -> content -> [output_text]
                response_text = response.output[0].content[0].text
            lines = response_text.splitlines()
            lines = [line for line in lines if not line.strip().startswith("#")]
            response_text = "\n".join(lines).strip()
            if response_text.startswith("```python"):
                response_text = response_text.strip("`").split("python", 1)[-1].strip()
            if response_text.startswith("```prolog"):
                response_text = response_text.strip("`").split("prolog", 1)[-1].strip()
            if response_text.endswith("```"):
                response_text = response_text.rsplit("```", 1)[0].strip()
            return response_text
        except Exception as e:
            print("Failed to parse response")
            print("Error:", e)
            return None

    def propose_input(self, max_retries=10):
        print(f"Proposing input based on {len(self.examples)} current examples...")
        examples, paths = zip(*self.examples)
        prompt, message = self.build_zendo_prompt_from_examples(examples, paths, True)
        # print(prompt)
        for i in range(max_retries):
            try:
                response_text = self.query_gpt_for_structure(prompt, message)
                # response_text = "[['item(0, yellow, pyramid, upright, grounded)', 'item(1, yellow, pyramid, upright, grounded)', 'item(2, yellow, wedge, flat, pointing(0))'], 1]"
                if type(response_text) is str:
                    try:
                        parsed = ast.literal_eval(response_text)
                    except Exception as e:
                        print("Failed to parse response using ast.literal_eval:", e, response_text)
                        continue

                    if not isinstance(parsed, list) or len(parsed) != 2:
                        print("Unexpected format. Expected: [[item strings...], label]", response_text)
                        continue

                    items, label = parsed
                    if not isinstance(items, list) or not all(isinstance(s, str) for s in items):
                        print("Invalid item list.", response_text)
                        continue
                else:
                    print("GPT-4o response is not a string.")
                    items = response_text[0]
                input_tensor = prolog_strings_to_tensor([items])[0]
                if input_tensor is None:
                    print("Failed to parse GPT-4o response into tensor.")
                    continue
                else:
                    duplicate = any(
                        (input_tensor.shape == ex.shape) and torch.equal(input_tensor, ex)
                        for (ex, _) in examples
                    )

                    if duplicate:
                        print(f"Attempt {i}: GPT proposed a duplicate structure, retrying...")
                        continue
                    if self.create_images:
                        print("GPT-4o response successfully parsed into tensor.")
                        candidate_path = Path(str(self.task_idx)) / Path(str(self.id)) / str(len(self.examples))
                        full_input_path = Path("generation") / Path("output") / (str(candidate_path) + ".png")
                        try:
                            new_input = render_scene(items, path=candidate_path)
                            if new_input is None:
                                print("Failed to render scene, returning None.")
                                continue
                            return new_input, label, full_input_path
                        except Exception as e:
                            print(f"Failed to convert Prolog scene to tensor:", e)
                            continue
                    else:
                        return input_tensor, label, ""
            except Exception as e:
                print("Failed to generate input:", e)
                return None, None, None
        return None, None, None

    def guess_label(self, input_scene):
        """
        Guess the label for the input scene based on the last proposed input.
        If the last label is None, return None.
        """
        # if self.last_label is None:
        #     print("No last label available, asking GPT.")
        #     examples, paths = zip(*self.examples)
        #     prompt = self.build_zendo_prompt_label(examples, input_scene, paths, False)
        #     # print(prompt)
        #     response_text = self.query_gpt_for_structure(prompt)
        #     # response_text = "1"
        #     if type(response_text) is str:
        #         try:
        #             parsed = ast.literal_eval(response_text)
        #         except Exception as e:
        #             print("Failed to parse response using ast.literal_eval:", e)
        #             return None

        #         if isinstance(parsed, int):
        #             return bool(parsed)
        #     else:
        #         print("GPT-4o response is not a string.")
        #         return response_text
        #     return None
        print(f"Guessing label for input scene: {self.last_label}")
        guess = bool(self.last_label)
        self.last_label = None
        return guess

    def guess_rule(self, max_attempts=5):
        """
        Guess the rule based on all examples.
        """
        print(f"Guessing rule based on {len(self.examples)} examples...")
        examples, paths = zip(*self.examples)
        prompt,message = self.build_zendo_prompt_guess_rule(examples, paths, True)
        # print(prompt)
        for i in range(max_attempts):
            response_text = self.query_gpt_for_structure(prompt, message)
            # response_text = "and([at_least(pyramid, 1, Structure), odd(wedge, grounded, Structure)])"
            if type(response_text) is str:
                try:
                    self.previous_guesses.append(response_text)
                    program = convert_prolog_to_dsl(response_text, self.cfg)
                except Exception as e:
                    print("Failed to parse response into DSL:", e)
                    if response_text in self.incorrect_rules:
                        continue
                    return response_text

                if program is not None and normalize_rule(program) not in self.incorrect_rules:
                    print("returning", str(program))
                    return program
            else:
                print("GPT-4o response is not a string.")
                return response_text
            print("Failed to parse GPT-4o response into a rule.")
            return None

    def build_zendo_prompt_guess_rule(self, examples, paths, use_paths=False):
        tensors = [t for t, _ in examples]
        labels = [l for _, l in examples]
        print(self.previous_guesses)
        structure_strs = tensor_to_prolog_strings(tensors)

        positives_text = []
        negatives_text = []
        positives_images = []
        negatives_images = []
        # Format examples
        if use_paths and paths and len(paths) != len(examples):
            raise ValueError("paths['examples'] length must match len(examples) when use_paths=True.")

        for label, struct_str, img_path in zip(labels, structure_strs, paths if use_paths else [None] * len(examples)):
            if label == 1:
                positives_text.append(str(struct_str))
                if img_path != "":
                    positives_images.append(encode_image_to_base64_uri(img_path))
            else:
                negatives_text.append(str(struct_str))
                if img_path != "":
                    negatives_images.append(encode_image_to_base64_uri(img_path))
        
        content_parts = []
        if not use_paths:
            header_text = f"""You are a Zendo player. Your job is to find a new logical classification rule for given examples with labels.
You are given a few positive and negative examples. Each image consists of pieces in different configurations.

Positive examples:
{chr(10).join(positives_text)}

Negative examples:
{chr(10).join(negatives_text)}

Previously guessed rules:
{chr(10).join(self.previous_guesses)}

Do NOT return any of the previous guesses.

**Available values:**
- Colors: red, blue, yellow
- Shapes: block, wedge, pyramid
- Orientations: upright, upside_down, flat, cheesecake, doorstop, vertical
- Interactions: grounded, touching, pointing, on_top_of

**Important constraints:**
- Wedges are never flat (only doorstop or cheesecake).
- Blocks and pyramids can be flat but not cheesecake or doorstop.
- grounded/ungrounded can only be used with single attributes, like: at_least_interaction(Attribute, Interaction, N, Structure)
- touching/pointing/on_top_of can only be used with two attributes, like: at_least_interaction(Attribute1, Attribute2, Interaction, N, Structure)

**Goal:**  
Find **one** Prolog-style rule that is **True for all positive examples** and **False for all negative examples**.  

**Critical rules for selecting your answer:**
1. **If a single predicate works, use it.**  
   Do NOT combine predicates unless a single one cannot fully separate positives from negatives.
2. The rule must be as short and simple as possible.
3. Return **only** the rule — no explanation, no formatting, no extra text.

The Rule must be written in **Prolog-style syntax**, using only the following predicates.
Use **only the following Prolog-compatible predicates** and regard the argument types:

### Count-based:
- `at_least(Attribute, N, Structure)`
- `at_least(Attribute1, Attribute2, N, Structure)`  
- `exactly(Attribute, N, Structure)`  
- `exactly(Attribute1, Attribute2, N, Structure)`  
- `zero(Attribute, Structure)`  
- `zero(Attribute1, Attribute2, Structure)`  
- `more_than(Attribute1, Attribute2, Structure)`

### Parity:
- `odd_number_of(Structure)`  
- `even_number_of(Structure)`  
- `odd_number_of(Attribute, Structure)`  
- `odd_number_of(Attribute1, Attribute2, Structure)`  
- `even_number_of(Attribute, Structure)`  
- `even_number_of(Attribute1, Attribute2, Structure)`

### Interaction-based:
- `at_least_interaction(Attribute, Interaction_g, N, Structure)`  
- `at_least_interaction(Attribute1, Attribute2, Interaction, N, Structure)`  
- `exactly_interaction(Attribute, Interaction_g, N, Structure)`  
- `exactly_interaction(Attribute1, Attribute2, Interaction, N, Structure)`  
- `odd_number_of_interaction(Attribute, Interaction_g, Structure)`  
- `odd_number_of_interaction(Attribute1, Attribute2, Interaction, Structure)`  
- `even_number_of_interaction(Attribute, Interaction_g, Structure)`  
- `even_number_of_interaction(Attribute1, Attribute2, Interaction, Structure)`

### Other:
- `exclusively(Attribute, Structure)`  
- `either_or(N1, N2, Structure)`  
- `all_three_shapes(Structure)`  
- `all_three_colors(Structure)`

### Logical:
- `and([Rule1, Rule2])` — use only if no single predicate works and not in combination with or([Rule1, Rule2]) AND ONLY ONCE PER RULE
- `or([Rule1, Rule2])` — use only if no single predicate works and not in combination with and([Rule1, Rule2]) AND ONLY ONCE PER RULE

### Attribute Constants:
Attributes must be lowercase and drawn from:
- Colors: `red`, `blue`, `yellow`
- Shapes: `block`, `wedge`, `pyramid`
- Orientations: `upright`, `upside_down`, `flat`, `cheesecake`, `doorstop`, `vertical`

### Interactions:
- Interaction: `touching`, `pointing`, `on_top_of`
- Interaction_g: `grounded`, `ungrounded` 
Note: `grounded` and `ungrounded` can only be used in the interaction predicates with just one attribute argument, noted as Interaction_g, while the others can only be used with two attributes, noted as Interaction.

### Explainations:
N, N1, N2 is a placeholder for a natural numbers in [1, 2, 3].
odd_number_of(Structure) = There exists an odd number of elements in the Structure.
odd_number_of(red, upright, Structure) = There exists an odd number of elements in the Structure that are red and upright.
odd_number_of_interaction(red, grounded, Structure) = There exists an odd number of elements in the Structure that are red and grounded.
odd_number_of_interaction(red, upright, touching, Structure) = There exists an odd number of elements in the Structure that are red touching an upright piece.
-> even, at_least, exactly, zero work similarly
more_than(Attribute1, Attribute2, Structure) = There exists more than Attribute1 elements in the Structure that are Attribute2.
either_or(N1, N2, Structure) = There exists either N1 or N2 elements in the Structure.

### Output Format:
Return **only** a single rule in Prolog-style syntax. Do **not** include explanations or extra text.

### Example:
```prolog
even_number_of(upright, Structure)
```
"""     
            return header_text, None 
        else:
            header_text = """You are a Zendo player. Your job is to find a new logical classification rule for given examples with labels.
You are given a few positive and negative examples. Each image consists of pieces in different configurations.
**Available values:**
- Colors: red, blue, yellow
- Shapes: block, wedge, pyramid
- Orientations: upright, upside_down, flat, cheesecake, doorstop, vertical
- Interactions: grounded, touching, pointing, on_top_of

**Important constraints:**
- Wedges are never flat (only doorstop or cheesecake).
- Blocks and pyramids can be flat but not cheesecake or doorstop.
- grounded/ungrounded can only be used with single attributes, like: at_least_interaction(Attribute, Interaction, N, Structure)
- touching/pointing/on_top_of can only be used with two attributes, like: at_least_interaction(Attribute1, Attribute2, Interaction, N, Structure)

**Goal:**  
Find **one** Prolog-style rule that is **True for all positive examples** and **False for all negative examples**.  

**Critical rules for selecting your answer:**
1. **If a single predicate works, use it.**  
   Do NOT combine predicates unless a single one cannot fully separate positives from negatives.
2. The rule must be as short and simple as possible.
3. Return **only** the rule — no explanation, no formatting, no extra text.

The Rule must be written in **Prolog-style syntax**, using only the following predicates.
Use **only the following Prolog-compatible predicates** and regard the argument types:

### Count-based:
- `at_least(Attribute, N, Structure)`
- `at_least(Attribute1, Attribute2, N, Structure)`  
- `exactly(Attribute, N, Structure)`  
- `exactly(Attribute1, Attribute2, N, Structure)`  
- `zero(Attribute, Structure)`  
- `zero(Attribute1, Attribute2, Structure)`  
- `more_than(Attribute1, Attribute2, Structure)`

### Parity:
- `odd_number_of(Structure)`  
- `even_number_of(Structure)`  
- `odd_number_of(Attribute, Structure)`  
- `odd_number_of(Attribute1, Attribute2, Structure)`  
- `even_number_of(Attribute, Structure)`  
- `even_number_of(Attribute1, Attribute2, Structure)`

### Interaction-based:
- `at_least_interaction(Attribute, Interaction_g, N, Structure)`  
- `at_least_interaction(Attribute1, Attribute2, Interaction, N, Structure)`  
- `exactly_interaction(Attribute, Interaction_g, N, Structure)`  
- `exactly_interaction(Attribute1, Attribute2, Interaction, N, Structure)`  
- `odd_number_of_interaction(Attribute, Interaction_g, Structure)`  
- `odd_number_of_interaction(Attribute1, Attribute2, Interaction, Structure)`  
- `even_number_of_interaction(Attribute, Interaction_g, Structure)`  
- `even_number_of_interaction(Attribute1, Attribute2, Interaction, Structure)`

### Other:
- `exclusively(Attribute, Structure)`  
- `either_or(N1, N2, Structure)`  
- `all_three_shapes(Structure)`  
- `all_three_colors(Structure)`

### Logical:
- `and([Rule1, Rule2])` — use only if no single predicate works and not in combination with or([Rule1, Rule2]) AND ONLY ONCE PER RULE
- `or([Rule1, Rule2])` — use only if no single predicate works and not in combination with and([Rule1, Rule2]) AND ONLY ONCE PER RULE

### Attribute Constants:
Attributes must be lowercase and drawn from:
- Colors: `red`, `blue`, `yellow`
- Shapes: `block`, `wedge`, `pyramid`
- Orientations: `upright`, `upside_down`, `flat`, `cheesecake`, `doorstop`, `vertical`

### Interactions:
- Interaction: `touching`, `pointing`, `on_top_of`
- Interaction_g: `grounded`, `ungrounded` 
Note: `grounded` and `ungrounded` can only be used in the interaction predicates with just one attribute argument, noted as Interaction_g, while the others can only be used with two attributes, noted as Interaction.

### Explainations:
N, N1, N2 is a placeholder for a natural numbers in [1, 2, 3].
odd_number_of(Structure) = There exists an odd number of elements in the Structure.
odd_number_of(red, upright, Structure) = There exists an odd number of elements in the Structure that are red and upright.
odd_number_of_interaction(red, grounded, Structure) = There exists an odd number of elements in the Structure that are red and grounded.
odd_number_of_interaction(red, upright, touching, Structure) = There exists an odd number of elements in the Structure that are red touching an upright piece.
-> even, at_least, exactly, zero work similarly
more_than(Attribute1, Attribute2, Structure) = There exists more than Attribute1 elements in the Structure that are Attribute2.
either_or(N1, N2, Structure) = There exists either N1 or N2 elements in the Structure.

### Output Format:
Return **only** a single rule in Prolog-style syntax. Do **not** include explanations or extra text.

### Example:
```prolog
even_number_of(upright, Structure)
```
"""
        content_parts.append({"type": "input_text", "text": header_text })
        if positives_images and negatives_images:
            content_parts.append({"type": "input_text", "text": "You might have already guessed some rules, but they were incorrect or incomplete. DO NOT output these rules again. These are the rules you guessed so far:\n" + "\n".join(self.previous_guesses)})
            content_parts.append({"type": "input_text", "text": "Positive examples:"})
            for uri in positives_images:
                content_parts.append({"type": "input_image", "image_url": uri})

            content_parts.append({"type": "input_text", "text": "Negative examples:"})
            for uri in negatives_images:
                content_parts.append({"type": "input_image", "image_url": uri})

        message = {"role": "user", "content": content_parts}
        return None, message

    def build_zendo_prompt_from_examples(self, examples, paths, use_paths=False):
        # Separate tensors and labels
        tensors = [t for t, _ in examples]
        labels = [l for _, l in examples]

        # Convert tensors to prolog strings
        structure_strs = tensor_to_prolog_strings(tensors)

        positives_text = []
        negatives_text = []
        positives_images = []
        negatives_images = []
        # Format examples
        if use_paths and paths and len(paths) != len(examples):
            raise ValueError("paths['examples'] length must match len(examples) when use_paths=True.")

        for label, struct_str, img_path in zip(labels, structure_strs, paths if use_paths else [None] * len(examples)):
            if label == 1:
                positives_text.append(str(struct_str))
                if img_path != "":
                    positives_images.append(encode_image_to_base64_uri(img_path))
            else:
                negatives_text.append(str(struct_str))
                if img_path != "":
                    negatives_images.append(encode_image_to_base64_uri(img_path))
        if use_paths and (positives_images or negatives_images):
            header_text = f"""You are a Zendo player. Your goal is to **gain new information** about the hidden rule by proposing a 
**novel** structure that is **maximally informative** (highly likely to change or confirm current beliefs).

You are given *visual* positive and negative examples. Study the images, but output your proposal as **text**.
The pieces can have
- colors: red, blue, yellow;
- shapes: block, wedge, pyramid;
- orientations: upright, upside_down, flat, cheesecake, doorstop.
Wedges are never flat but instead can be doorstop or cheesecake, while the two other shapes can be flat but not cheesecake or doorstop.
Interactions can be: grounded, touching(ID), pointing(ID) and on_top_of(ID), where ID is the first field of another piece, e.g. "pointing(2)" means this piece is pointing to the piece with ID 2.

Please ONLY return a new example and its label within a python block, in this exact format, where label is 1 for valid and 0 for invalid:
Here are examples of valid formats:
[["item(0, red, block, upright, grounded)", "item(1, blue, wedge, doorstop, touching(0))"], 1]
[["item(0, yellow, pyramid, upside_down, grounded)", "item(1, blue, wedge, doorstop, on_top_of(0))", "item(2, red, block, upright, pointing(1))"], 0]
Return your answer in this exact format including the python block:
```python
[["item(ID, color, shape, orientation, interaction)", ...], label]
```
"""
        else:
            header_text = f"""You are a Zendo player. Your job is to generate a new structure example to gain new knowledge about the hidden rule.
You are given a few positive and negative examples. Each structure consists of a list of items with the format:
    "item(ID, color, shape, orientation, interaction)".

Positive examples:
{chr(10).join(positives_text)}

Negative examples:
{chr(10).join(negatives_text)}

Please ONLY return a new example and its label within a python block, in this exact format, where label is 1 for valid and 0 for invalid:
```python
[["item(ID, color, shape, orientation, interaction)", ...], label]
```
"""

        content_parts = []
        if use_paths and (positives_images or negatives_images):
            content_parts.append({"type": "input_text", "text": header_text})
            content_parts.append({"type": "input_text", "text": "Positive examples:"})
            for uri in positives_images:
                content_parts.append({"type": "input_image", "image_url": uri})
            content_parts.append({"type": "input_text", "text": "Negative examples:"})
            for uri in negatives_images:
                content_parts.append({"type": "input_image", "image_url": uri})

            message = {"role": "user", "content": content_parts}
            return None, message
        else:
            return header_text, None
        
class GPTVisionModel(FullGPTZendoPlayer):
    def detect_image(self, path, json_path):
        print(f"Detecting pieces in image {path}...")
        prompt, message = self.build_detection_prompt_from_examples(path)
        if message == None:
            print("No examples provided for detection.")
        response_text = self.query_gpt_for_structure(prompt, message)
        # response_text = "['item(0, yellow, pyramid, upright, grounded)', 'item(1, green, pyramid, upright, grounded)', 'item(2, yellow, wedge, flat, pointing(0))']"
        if type(response_text) is str:
            try:
                parsed = ast.literal_eval(response_text)
            except Exception as e:
                print("Failed to parse response using ast.literal_eval:", e, response_text)

            if not isinstance(parsed, list):
                print("Unexpected format. Expected: [[item strings...], label]", response_text)
            print("Parsed:", parsed)
            items = parsed
            if not isinstance(items, list) or not all(isinstance(s, str) for s in items):
                print("Invalid item list.", response_text)
            else:
                try:
                    input_tensor = prolog_strings_to_tensor([items])[0]
                    if input_tensor is None:
                        print("Failed to parse GPT-4o response into tensor.")
                except Exception as e:
                    print("Error occurred while converting items to tensor:", e)
                    input_tensor = None
            if input_tensor is None:
                record = {
                    "image_path": str(path),
                    "gpt_output": response_text,
                    "parsed_items": items,
                }
            else:
                record = {
                    "image_path": str(path),
                    "gpt_output": response_text,
                    "parsed_items": items,
                    "tensor": _to_jsonable(input_tensor),
                }
            json_path = Path(json_path)
            json_path.parent.mkdir(parents=True, exist_ok=True)
            with json_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        return

    def build_detection_prompt_from_examples(self, path):
        # Separate tensors and labels

        image = []
        # Format examples

        image.append(encode_image_to_base64_uri(path))
        if image:
            header_text = f"""You are a Zendo Vision Model. Your goal is to detect all pieces in the image, and return a list of string descriptions for each piece.

Study the image, but output your findings as **text**.
For each piece you find, give it a unique ID starting from 0, and describe its color, shape, orientation, and interaction with other pieces. Forthe interactions, use the IDs of the other pieces.
The pieces can have
- colors: red, blue, yellow;
- shapes: block, wedge, pyramid;
- orientations: upright, upside_down, flat, cheesecake, doorstop.
Wedges are never flat but instead can be doorstop or cheesecake, while the two other shapes can be flat but not cheesecake or doorstop.
Interactions can be: grounded, touching(ID), pointing(ID) and on_top_of(ID), where ID is the first field of another piece, e.g. "pointing(2)" means this piece is pointing to the piece with ID 2.

Rules for interactions:
- grounded means the piece is touching the ground and is the default value.
- touching(ID) means this piece is in contact with the piece with ID on either side except top or bottom.
- pointing(ID) means this piece is pointing to the piece with ID meaning the piece is flat or cheesecake or doorstop and the head of the piece is pointing to the other piece.
- on_top_of(ID) means this piece is resting on top of the piece with ID.

Please ONLY return the descriptions within a python block, in this exact format:
Here are examples of valid formats:
- ["item(0, red, block, upright, grounded)", "item(1, blue, wedge, doorstop, touching(0))"]
- ["item(0, yellow, pyramid, upside_down, grounded)", "item(1, blue, wedge, doorstop, on_top_of(0))", "item(2, red, block, upright, pointing(1))"]
Return your answer in this exact format including the python block:
```python
["item(ID, color, shape, orientation, interaction)", ...]
```
"""
        else:
            return "No examples provided.", None

        content_parts = []
        content_parts.append({"type": "input_text", "text": header_text})
        for uri in image:
            content_parts.append({"type": "input_image", "image_url": uri})
        message = {"role": "user", "content": content_parts}
        return None, message

def encode_image_to_base64_uri(image_path):
    mime_type, _ = mimetypes.guess_type(image_path)
    if mime_type is None:
        mime_type = "image/png"  # default
    with open(image_path, "rb") as img_file:
        b64 = base64.b64encode(img_file.read()).decode("utf-8")
    return f"data:{mime_type};base64,{b64}"

def _to_jsonable(x):
    try:
        if isinstance(x, torch.Tensor):
            return x.detach().cpu().tolist()
    except Exception:
        pass
    try:
        if isinstance(x, np.ndarray):
            return x.tolist()
    except Exception:
        pass
    return x

# class CommandLineZendoPlayer(ZendoPlayer):
#     def __init__(self, player_id, model, dsl, cfg, bar=5e-7):
#         super().__init__(player_id, model, dsl, cfg)
#         self.token_NONE = 8
#         self.directions = ["left", "right", "front", "back", "top", "bottom"]
#         self.lexicons = {
#             # Lexicons
#             "color_lexicon": ["red", "blue", "yellow"],
#             "shape_lexicon": ["block", "wedge", "pyramid"],
#             "orientation_lexicon": ["upright", "upside_down", "flat", "cheesecake"],
#         }

#     def decide_guess(self, state):
#         if self.guessing_stones <= 0:
#             return None
#         mode = input("---Should I guess the rule? (y/n): ").strip()
#         if mode.lower() != 'y':
#             print(f"Player {self.id} decided not to guess the rule.")
#             return None
#         rule = self.guess_rule()
#         if rule is None:
#             print(f"Player {self.id} could not find a rule")
#             return None
#         self.guessing_stones -= 1
#         print(f"Player {self.id} guessed rule: {rule}")
#         return {"type": "guess_rule", "rule": rule}

#     def guess_label(self, input_scene):
#         print("Input scene:")
#         for piece in input_scene:
#             if piece[0] == 7:
#                 continue  # padding
#             color = self.lexicons['color_lexicon'][piece[1]]
#             shape = self.lexicons['shape_lexicon'][piece[2]]
#             if piece[2] == 1 and piece[3] == 2:
#                 orientation = "doorstop"
#             else:
#                 orientation = self.lexicons['orientation_lexicon'][piece[3]]
#             desc = f"Piece {piece[0]}: {color}, {shape}, {orientation}"
#             if piece[10] != self.token_NONE:
#                 desc += f", pointing at {piece[10]}"
#             touching = [f"{piece[4 + d]} on {self.directions[d]}" for d in range(6) if piece[4 + d] != self.token_NONE]
#             if touching:
#                 desc += ", touching " + ", ".join(touching)
#             print("   ", desc)
#         response = input("---Does this structure follow the rule? (y/n): ")
#         return response.strip().lower() == 'y'

#     def guess_rule(self):
#         rule = input("---Enter your guessed rule in Prolog format: ")
#         rule = rule.strip()
#         if not rule:
#             print("No rule entered, returning None.")
#             return None
#         try:
#             rule_function = convert_prolog_to_dsl(rule, self.cfg)
#         except Exception as e:
#             print(f"Failed to parse rule: {e}")
#             return None
#         return rule_function

#     def propose_input(self):
#         print("\nYour current examples:")
#         for i, (example, _) in enumerate(self.examples):
#             tensor, label = example
#             print(f"{i}. Structure {'follows the rule' if label else 'does not follow the rule'}:")
#             for piece in tensor:
#                 if piece[0] == 7:
#                     continue
#                 color = self.lexicons['color_lexicon'][piece[1]]
#                 shape = self.lexicons['shape_lexicon'][piece[2]]
#                 if piece[2] == 1 and piece[3] == 2:
#                     orientation = "doorstop"
#                 else:
#                     orientation = self.lexicons['orientation_lexicon'][piece[3]]
#                 desc = f"Piece {piece[0]}: {color}, {shape}, {orientation}"
#                 if piece[10] != self.token_NONE:
#                     desc += f", pointing at {piece[10]}"
#                 touching = [f"{piece[4 + d]} on {self.directions[d]}" for d in range(6) if piece[4 + d] != self.token_NONE]
#                 if touching:
#                     desc += ", touching " + ", ".join(touching)
#                 print("   ", desc)

#         print("\nNow enter a new input piece-by-piece (max 7 pieces). Leave blank to finish early.")
#         pieces = []
#         for i in range(7):
#             raw = input(f"---Piece {i} [format: color,shape,orientation]: ").strip()
#             if not raw:
#                 break
#             try:
#                 color_str, shape_str, orient_str = map(str.strip, raw.split(","))
#                 color = self.lexicons['color_lexicon'].index(color_str)
#                 shape = self.lexicons['shape_lexicon'].index(shape_str)
#                 if orient_str == "doorstop":
#                     orientation = 2
#                 else:
#                     orientation = self.lexicons['orientation_lexicon'].index(orient_str)

#                 # Get touching (optional)
#                 touching = [self.token_NONE] * 6
#                 for d, dir_name in enumerate(self.directions):
#                     val = input(f"  ↳ touching on {dir_name} (target ID or blank): ").strip()
#                     if val.isdigit():
#                         touching[d] = int(val)

#                 # Get pointing (optional)
#                 pointing = input("  ↳ pointing at (target ID or blank): ").strip()
#                 pointing_val = int(pointing) if pointing.isdigit() else self.token_NONE

#                 piece = torch.tensor([i, color, shape, orientation] + touching + [pointing_val] + [-1]*4, dtype=torch.int64)
#                 pieces.append(piece)
#             except Exception as e:
#                 print("Invalid input. Please try again.", e)
#                 continue

#         if any(len(p) != 15 for p in pieces):
#             print("One or more entered pieces have incorrect length.")
#             return None

#         while len(pieces) < 7:
#             pad = torch.tensor([7, 3, 3, 4] + [7]*7 + [-1]*4, dtype=torch.int64)
#             pieces.append(pad)

#         structure = torch.stack(pieces)
#         return structure

#     def react(self, state):
#         proposed_input = self.propose_input()
#         if proposed_input is None:
#             return {"type": "propose_input", "input": None, "mode": "TELL"}
#         mode = input("---Should I quiz or tell? (quiz/tell): ").strip().upper()
#         return {"type": "propose_input", "input": (proposed_input, ""), "mode": mode if mode in ("QUIZ", "TELL") else "TELL"}