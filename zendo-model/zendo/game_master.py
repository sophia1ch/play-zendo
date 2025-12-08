from pathlib import Path
from data.create_prolog import dsl_to_prolog
from data.pieces2tensor import prolog_strings_to_tensor
from data.tensor2piece import tensor_to_prolog_strings
from generation.render import render_scene
from program import Program, strip_trailing_var0
import torch

from zendo.player import call_prolog_subprocess_with_retries, normalize_rule

class ZendoStateGameMaster:
    def __init__(self, true_program: Program, task_idx, dataset, paths, zendo_dsl, cfg, images=True, ask_for_counter=False, use_images=False):
        self.true_program = true_program
        self.dsl = zendo_dsl
        self.cfg = cfg
        self.remaining_examples = []
        self.paths = paths
        self.counter = 0
        self.task_idx = task_idx
        self.token_NONE = 8
        self.use_images = use_images
        self.ask_counter = ask_for_counter
        self.directions = ["left", "right", "front", "back", "top", "bottom"]
        self.lexicons = {
            # Lexicons
            "color_lexicon": ["red", "blue", "yellow"],
            "shape_lexicon": ["block", "wedge", "pyramid"],
            "orientation_lexicon": ["upright", "upside_down", "flat", "cheesecake"],
        }
        self.create_images = images
        for i, (tensor, label) in enumerate(dataset):
            try:
                pred = self.true_program.eval(dsl=self.dsl, environment=(tensor, None), i=i)(tensor)
                if pred != label:
                    print(
                        f"Label mismatch at index {i}: expected {label}, but got {pred} from true_program."
                    )
                label = bool(label)
            except Exception as e:
                raise ValueError(f"Failed to evaluate example {i}: {e}")
            self.remaining_examples.append(((tensor, label), self.paths[i]))

    def initial_examples(self):
        positives = [(ex, path) for ex, path in self.remaining_examples if ex[1] is True]
        negatives = [(ex, path) for ex, path in self.remaining_examples if ex[1] is False]

        if not positives or not negatives:
            raise ValueError("Not enough positive and negative examples to start.", self.remaining_examples)

        pos_example = positives[0]
        neg_example = negatives[0]

        def safe_remove(example):
            (target, target_path) = example
            for i, ((tensor, label), path) in enumerate(self.remaining_examples):
                if tensor is not None:
                    if torch.equal(tensor, target[0]) and label == target[1]:
                        del self.remaining_examples[i]
                        return
                else:
                    if path == target_path:
                        del self.remaining_examples[i]
                        return

        safe_remove(pos_example)
        safe_remove(neg_example)
        if self.use_images:
            pos_example = ((None, pos_example[0][1]), pos_example[1])
            neg_example = ((None, neg_example[0][1]), neg_example[1])
        return [pos_example, neg_example]
    
    def initial_example(self):
        positives = [(ex, path) for ex, path in self.remaining_examples if ex[1] is True]

        if not positives:
            print(self.remaining_examples)
            raise ValueError("Not enough positive examples to start.")

        pos_example = positives[0]

        def safe_remove(example):
            (target, target_path) = example
            for i, ((tensor, label), path) in enumerate(self.remaining_examples):
                if tensor is not None:
                    if torch.equal(tensor, target[0]) and label == target[1]:
                        del self.remaining_examples[i]
                        return
                else:
                    if path == target_path:
                        del self.remaining_examples[i]
                        return

        safe_remove(pos_example)
        if self.use_images:
            pos_example = ((None, pos_example[0][1]), pos_example[1])
        return pos_example
    
    def test_scenes(self):
        positives = [(ex, path) for ex, path in self.remaining_examples if ex[1] is True]
        negatives = [(ex, path) for ex, path in self.remaining_examples if ex[1] is False]

        if not positives or not negatives:
            print(self.remaining_examples)
            raise ValueError("Not enough positive and negative examples to start.")

        pos_examples = positives[:4]
        neg_examples = negatives[:4]

        def safe_remove(example):
            (target, target_path) = example
            for i, ((tensor, label), path) in enumerate(self.remaining_examples):
                if tensor is not None:
                    if torch.equal(tensor, target[0]) and label == target[1]:
                        del self.remaining_examples[i]
                        return
                else:
                    if path == target_path:
                        del self.remaining_examples[i]
                        return
        for pos_example in pos_examples:
            safe_remove(pos_example)
        for neg_example in neg_examples:
            safe_remove(neg_example)
        if self.use_images:
            pos_examples = [((None, ex[0][1]), ex[1]) for ex in pos_examples]
            neg_examples = [((None, ex[0][1]), ex[1]) for ex in neg_examples]
        return pos_examples + neg_examples

    def get_next_example(self):
        print("Getting next example from remaining examples.", len(self.remaining_examples))
        if self.remaining_examples:
            return self.remaining_examples.pop(0)
        else:
            return None

    def label_input(self, tensor):
        try:
            strip_trailing_var0(self.true_program)
            program = self.true_program.eval(
                dsl=self.dsl,
                environment=(tensor, None),
                i=0
            )
            print("Labeling input:", tensor, self.true_program)
            return program(tensor)
        except Exception as e:
            raise ValueError(f"Failed to evaluate input: {e}")
    
    def check_guess(self, guess):
        if not isinstance(guess, Program):
            mode = input(f"Player guessed program: {guess}\n correct is {self.true_program}\n is it correct? (y/n): ").strip()
            if mode.lower() == 'y':
                return True
            else:
                return False
        norm_true_program = normalize_rule(self.true_program)
        norm_guess = normalize_rule(guess)
        return str(norm_guess) == str(norm_true_program)

    def disprove_guess(self, guess):
        if isinstance(guess, Program):
            for i, ((tensor, _), _) in enumerate(self.remaining_examples):
                try:
                    strip_trailing_var0(guess)
                    strip_trailing_var0(self.true_program)
                    true_val = self.true_program.eval(dsl=self.dsl, environment=(tensor, None), i=i)
                    true_label = true_val(tensor)

                    guess_val = guess.eval(dsl=self.dsl, environment=(tensor, None), i=i)
                    guess_label = guess_val(tensor)

                    if guess_label and not true_label:
                        return self.remaining_examples.pop(i)

                    if not guess_label and true_label:
                        return self.remaining_examples.pop(i)

                except Exception as e:
                    print(f"ERROR: Skipping example due to evaluation error: {e}")
                    continue

            print("Guess could not be disproven with remaining examples.")
            return self.disprove_guess_via_prolog(guess)
        else:
            print(f"Player guessed program: {guess}, correct is {self.true_program} \n give counter example")
            structure, label = self.ask_for_counter(guess)
            return ((structure, label), "")

    def disprove_guess_via_prolog(self, guess_program):
        true_prolog = dsl_to_prolog(self.true_program)
        guess_prolog = dsl_to_prolog(guess_program)

        true_query = f"generate_valid_structure([{true_prolog}], Structure)"
        guess_query = f"generate_valid_structure([{guess_prolog}], Structure)"

        print("Try to find example accepted by guess but rejected by true_program")
        strip_trailing_var0(guess_program)
        strip_trailing_var0(self.true_program)
        for _ in range(20):
            scene = call_prolog_subprocess_with_retries(1, guess_query, "rules/rules.pl")[0]
            if scene is not None:
                guess_input = prolog_strings_to_tensor([scene])[0]
                try:
                    out_true = self.true_program.eval(dsl=self.dsl, environment=(guess_input, None), i=0)(guess_input)
                    if not out_true:
                        path = Path(str(self.task_idx)) / Path("counter") / str(self.counter)
                        full_input_path = Path("generation") / Path("output") / (str(path) + ".png")
                        if self.create_images:
                            guess_input_rendered = render_scene(scene, path)
                            if guess_input_rendered is not None:
                                self.counter += 1
                                return ((None, False), full_input_path)
                        else:
                           return ((guess_input, False), "") 
                except Exception as e:
                    print("Error evaluating guess program with scene:", scene, guess_input, e)
                    continue

        print("Try to find example accepted by true_program but rejected by guessed program")
        for _ in range(40):
            scene = call_prolog_subprocess_with_retries(1, true_query, "rules/rules.pl")[0]
            if scene is not None:
                true_input = prolog_strings_to_tensor([scene])[0]
                try:
                    out_guess = guess_program.eval(dsl=self.dsl, environment=(true_input, None), i=0)(true_input)
                    if not out_guess:
                        if self.create_images:
                            path = Path(str(self.task_idx)) / Path("counter") / str(self.counter)
                            full_input_path = Path("generation") / Path("output") / (str(path) + ".png")
                            true_input_rendered = render_scene(scene, path)
                            if true_input_rendered is not None:
                                self.counter += 1
                            return ((None, True), full_input_path)
                        else:
                            return ((true_input, True), "")
                except:
                    continue
        if self.ask_counter:
            structure, label = self.ask_for_counter(guess_program)
            if structure[0][1] == 3:
                print("Player provided padded structure, ignoring.")
                return None
            if self.create_images:
                prolog_strings = tensor_to_prolog_strings([structure])
                path = Path(str(self.task_idx)) / Path("counter") / str(self.counter)
                full_input_path = Path("generation") / Path("output") / (str(path) + ".png")
                true_input_rendered = render_scene(prolog_strings[0], path)
                if true_input_rendered is not None:
                    self.counter += 1
                return ((None, label), full_input_path)
            return ((structure, label), "")
        else:
            return None

    def ask_for_counter(self, guessed):
        if str(guessed) == "(AT_LEAST_INTERACTION 1 (ON_TOP_OF IS_YELLOW IS_WEDGE))":
            structure = torch.tensor([[ 0,  2,  0,  0,  8,  8,  8,  8,  8,  1,  8, -1, -1, -1, -1],
                [ 1,  1,  1,  2,  8,  8,  8,  8,  0,  8,  8, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1]], dtype=torch.long)
            label = False
            print("Auto counterexample for known guess:", structure, label)
            return structure, label
        if str(guessed) == "(ODD_INTERACTION (ON_TOP_OF IS_YELLOW IS_WEDGE))":
            structure = torch.tensor([[ 0,  2,  0,  0,  8,  8,  8,  8,  8,  1,  8, -1, -1, -1, -1],
                [ 1,  1,  1,  3,  8,  8,  8,  8,  0,  8,  8, -1, -1, -1, -1],
                [ 2,  2,  2,  2,  8,  8,  8,  8,  8,  3,  8, -1, -1, -1, -1],
                [ 3,  0,  1,  3,  8,  8,  8,  8,  2,  8,  8, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1]], dtype=torch.long)
            label = True
            print("Auto counterexample for known guess:", structure, label)
            return structure, label
        if str(guessed) == "(ODD_INTERACTION (ON_TOP_OF IS_YELLOW IS_CHEESECAKE))":
            structure = torch.tensor([[ 0,  2,  0,  0,  8,  8,  8,  8,  8,  1,  8, -1, -1, -1, -1],
                [ 1,  0,  1,  3,  8,  8,  8,  8,  0,  8,  8, -1, -1, -1, -1],
                [ 2,  2,  2,  0,  8,  8,  8,  8,  8,  3,  8, -1, -1, -1, -1],
                [ 3,  1,  1,  3,  8,  8,  8,  8,  2,  8,  8, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1]], dtype=torch.long)
            label = True
            print("Auto counterexample for known guess:", structure, label)
            return structure, label
        if str(guessed) == "(AT_LEAST_2 3 IS_VERTICAL IS_WEDGE)":
            structure = torch.tensor([[ 0,  2,  1,  0,  1,  8,  8,  8,  8,  8,  8, -1, -1, -1, -1],
                [ 1,  0,  1,  1,  2,  0,  8,  8,  0,  8,  8, -1, -1, -1, -1],
                [ 2,  2,  1,  0,  8,  1,  8,  8,  8,  3,  8, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1],
                [ 7,  3,  3,  4,  7,  7,  7,  7,  7,  7,  7, -1, -1, -1, -1]], dtype=torch.long)
            label = False
            print("Auto counterexample for known guess:", structure, label)
            return structure, label
        print(f"Player guessed program: {guessed}, correct is {self.true_program}")
        print("\a", end="", flush=True)
        print("\nNow enter a new input piece-by-piece (max 7 pieces). Leave blank to finish early.")
        pieces = []
        for i in range(7):
            raw = input(f"---Piece {i} [format: color,shape,orientation]: ").strip()
            if not raw:
                break
            try:
                color_str, shape_str, orient_str = map(str.strip, raw.split(","))
                color = self.lexicons['color_lexicon'].index(color_str)
                shape = self.lexicons['shape_lexicon'].index(shape_str)
                if orient_str == "doorstop":
                    orientation = 2
                else:
                    orientation = self.lexicons['orientation_lexicon'].index(orient_str)

                # Get touching (optional)
                touching = [self.token_NONE] * 6
                for d, dir_name in enumerate(self.directions):
                    val = input(f"  ↳ touching on {dir_name} (target ID or blank): ").strip()
                    if val.isdigit():
                        touching[d] = int(val)

                # Get pointing (optional)
                pointing = input("  ↳ pointing at (target ID or blank): ").strip()
                pointing_val = int(pointing) if pointing.isdigit() else self.token_NONE

                piece = torch.tensor([i, color, shape, orientation] + touching + [pointing_val] + [-1]*4, dtype=torch.int64)
                print(f"Piece {i} created: {piece}")
                pieces.append(piece)
            except Exception as e:
                print("Invalid input. Please try again.", e)
                i-=1
                continue

        if any(len(p) != 15 for p in pieces):
            print("One or more entered pieces have incorrect length.")
            return None

        while len(pieces) < 7:
            pad = torch.tensor([7, 3, 3, 4] + [7]*7 + [-1]*4, dtype=torch.int64)
            pieces.append(pad)

        structure = torch.stack(pieces)
        label = input("Is this a positive example? (y/n): ").strip().lower() == 'y'
        print("Structure created:", structure, "Label:", label)
        return structure, label
