from dataclasses import dataclass, field
from enum import Enum, auto
import pickle
from typing import Any
import json
import time
from zendo.game_master import ZendoStateGameMaster
from zendo.player import ZendoPlayerInterface
import random

class Turn(Enum):
      PROPOSE = auto()
      LABEL = auto()
      GUESS = auto()
      GUESS_BRAMLEY = auto()
      END = auto()

def is_json_serializable(value):
    try:
        json.dumps(value)
        return True
    except (TypeError, OverflowError):
        return False

def sanitize(value):
    if isinstance(value, dict):
        return {k: sanitize(v) for k, v in value.items() if is_json_serializable(v)}
    elif isinstance(value, list):
        return [sanitize(v) for v in value if is_json_serializable(v)]
    elif is_json_serializable(value):
        return value
    return str(value)
        
@dataclass
class GameState:
      correct_program: str | None
      difficulty: str
      examples: list[tuple]
      examples_proposed: dict[int, int]
      guesses: dict[int, list[str]]
      player_guess_tokens: dict[int, int]  # player_id -> tokens
      current_turn: Turn
      last_action: dict | None
      input_scene: Any | None = None
      input_scene_rule: str | None = None
      quiz_mode: bool = False
      player_label_guesses: dict[int, bool] = field(default_factory=dict)
      bramley_guesses: dict[int, list[list[bool], list[bool], list[bool]]] = field(default_factory=dict) # gt, guess, correct
      bramley_rule: str | None = None
      bramley_test_examples: list[tuple] = field(default_factory=list)
      won: bool = False
      max_examples: int = 30
      game_over_reason: str = ""
      turn_timer_start: float = None
      turn_durations: dict[int, float] = field(default_factory=dict)
      turn = 0
      player = 0
      turn_descriptions: list[str] = field(default_factory=list)
      def to_dict(self):
            (examples, paths) = zip(*self.examples)
            (bramley_examples, bramley_paths) = zip(*self.bramley_test_examples) if self.bramley_test_examples else ([], [])
            return [{
                  "correct_program": str(self.correct_program) if self.correct_program else None,
                  "difficulty": self.difficulty,
                  "turns": self.turn,
                  "examples": len(self.examples),
                  "guesses": self.guesses,
                  "player_guess_tokens": self.player_guess_tokens,
                  "last_action": sanitize(self.last_action),
                  "player_label_guesses": self.player_label_guesses,
                  "won": self.won,
                  "max_examples": self.max_examples,
                  "game_over_reason": self.game_over_reason,
                  "paths": [str(p) for p in paths],
                  "bramley_test_examples": [str(p) for p in bramley_paths],
                  "turn_durations": {str(k): v for k, v in self.turn_durations.items()},
                  "turn_descriptions": self.turn_descriptions,
                  "bramley": self.bramley_guesses,
                  "bramley_rule": self.bramley_rule,
            }, examples, bramley_examples]

def step(state: GameState, players: list[ZendoPlayerInterface], gm: ZendoStateGameMaster, bramley=False) -> GameState:
      if len(state.examples) >= state.max_examples:
            state.current_turn = Turn.END
            duration = time.time() - state.turn_timer_start
            state.turn_durations[state.turn] = duration
            print(f"⏱️ Turn {state.turn} duration: {duration:.2f} seconds")
            state.game_over_reason = "Max examples reached"
            return state
      if state.current_turn in (Turn.PROPOSE, Turn.END):
        # If the last turn had a timer running, save its duration
        if state.turn_timer_start is not None:
            duration = time.time() - state.turn_timer_start
            state.turn_durations[state.turn] = duration
            print(f"⏱️ Turn {state.turn} duration: {duration:.2f} seconds")
            state.turn_timer_start = None
      if state.current_turn == Turn.PROPOSE:
            state.turn += 1
            state.player = state.turn % len(players)
            if bramley and state.turn > 7:
                  state.current_turn = Turn.GUESS_BRAMLEY
                  return state
            print(f"========Turn: {state.turn}, Player: {state.player}========")
            num_players = len(players)
            for i in range(num_players):
                  op = players[i]
                  op.system_message(f"Turn: {state.turn}, Player: {state.player}")
            state.turn_timer_start = time.time()
            proposer = players[state.player]
            action = proposer.react(state)
            state.last_action = action
            print(f"Player {proposer.id} action: {action}")
            if action["input"] is None:
                  print(f"Player {proposer.id} proposed no input, skipping turn")
                  state.current_turn = Turn.PROPOSE
                  example = gm.get_next_example()
                  for i, p in enumerate(players):
                        p.observe(example)
                  state.examples.append(example)
                  save_game(state, gm, players)
                  return state

            if action["type"] == "propose_input":
                  state.input_scene = action["input"]
                  state.examples_proposed[proposer.id] = state.examples_proposed.get(proposer.id, 0) + 1
                  state.quiz_mode = action["mode"] == "QUIZ"
                  state.input_scene_rule = action.get("rule", "")
                  if state.input_scene_rule != "":
                        turn_description = f"Turn {state.turn}, Player {state.player} proposed input based on rule: {state.input_scene_rule}"
                        state.turn_descriptions.append(turn_description)
                  state.current_turn = Turn.LABEL
                  if bramley:
                        if state.turn <= 7:
                              state.quiz_mode = False

      elif state.current_turn == Turn.LABEL:
            label = gm.label_input(state.input_scene[0])
            state.examples.append(((state.input_scene[0], label), state.input_scene[1]))

            if state.quiz_mode:
                  print("QUIZ mode: players guessing label")
                  num_players = len(players)
                  for i in range(num_players):
                        op = players[i]
                        guess = op.guess_label(state.input_scene)
                        correct = (guess == label)
                        state.player_label_guesses[op.id] = correct
                        if correct:
                              turn_description = f"Turn {state.turn}, Player {op.id}: Step: {state.current_turn}: Quiz mode correct, guessed {guess}"
                              state.turn_descriptions.append(turn_description)
                              print(f"Player {op.id} guessed correctly: {guess}")
                              state.player_guess_tokens[op.id] = state.player_guess_tokens.get(op.id, 0) + 1
                              op.quiz_correct()
                        else:
                              op.quiz_incorrect()
                              turn_description = f"Turn {state.turn}, Player {op.id}: Step: {state.current_turn}: Quiz mode incorrect, guessed {guess}, correct was {label}"
                              state.turn_descriptions.append(turn_description)
                              print(f"Player {op.id} guessed incorrectly: {guess}")
                        op.observe(((state.input_scene[0], label), state.input_scene[1]))
                  for i in range(num_players):
                        op = players[i]
                        for other_id, stones in state.player_guess_tokens.items():
                              if other_id != op.id:
                                    print(f"Updating player {op.id} with stones from player {other_id}: {stones}")
                                    op.update_others_guessing_stones(other_id, stones)
                  if len(state.examples) >= state.max_examples:
                        state.current_turn = Turn.END
                        duration = time.time() - state.turn_timer_start
                        state.turn_durations[state.turn] = duration
                        print(f"⏱️ Turn {state.turn} duration: {duration:.2f} seconds")
                        state.game_over_reason = "Max examples reached"
                  else:
                        state.current_turn = Turn.GUESS
            else:
                  turn_description = f"Turn {state.turn}, Player {state.player}: Step: {state.current_turn}: Tell mode"
                  state.turn_descriptions.append(turn_description)
                  print("TELL mode: GM reveals label")
                  for op in players:
                        if op.id != state.player:
                              op.observe(((state.input_scene[0], label), state.input_scene[1]), description="Other player proposed input and chose tell mode, label is: " + str(label))
                        else:
                              op.observe(((state.input_scene[0], label), state.input_scene[1]), description="You proposed input and chose tell mode, label is: " + str(label))
             
                  if len(state.examples) >= state.max_examples:
                        state.current_turn = Turn.END
                        duration = time.time() - state.turn_timer_start
                        state.turn_durations[state.turn] = duration
                        print(f"⏱️ Turn {state.turn} duration: {duration:.2f} seconds")
                        state.game_over_reason = "Max examples reached"
                  else:
                        state.current_turn = Turn.GUESS
                        if bramley:
                              state.current_turn = Turn.PROPOSE

      elif state.current_turn == Turn.GUESS:
            print("Players guessing rules")
            p = players[state.player]
            print(f"Player {p.id} has {state.player_guess_tokens.get(p.id, 0)} guess tokens")
            while state.player_guess_tokens.get(p.id, 0) > 0:
                  guess_action = p.decide_guess(state)
                  if guess_action is None:
                        turn_description = f"Turn {state.turn}, Player {state.player}: Step: {state.current_turn}: Not guessing rule"
                        state.turn_descriptions.append(turn_description)
                        break
                  turn_description = f"Turn {state.turn}, Player {state.player}: Step: {state.current_turn}: Guessing rule"
                  state.turn_descriptions.append(turn_description)
                  rule = guess_action["rule"]
                  correct = gm.check_guess(rule)
                  print(f"Player {p.id} guessed: {rule}, correct: {correct}, correct rule: {gm.true_program}")
                  state.guesses[p.id].append(str(rule))
                  state.player_guess_tokens[p.id] -= 1

                  if correct:
                        num_players = len(players)
                        for i in range(num_players):
                              player_index = (state.player + i) % num_players
                              op = players[player_index]
                              op.system_message(f"Player {state.player} guessed the correct rule: {rule}. Game over.")
                        state.won = True
                        state.current_turn = Turn.END
                        state.examples = players[state.player].examples
                        state.game_over_reason = f"Player {p.id} guessed rule correctly"
                        duration = time.time() - state.turn_timer_start
                        state.turn_durations[state.turn] = duration
                        print(f"⏱️ Turn {state.turn} duration: {duration:.2f} seconds")
                        state.turn_timer_start = None
                        return state
                  else:
                        num_players = len(players)
                        for i in range(num_players):
                              player_index = (state.player + i) % num_players
                              op = players[player_index]
                              for other_id, stones in state.player_guess_tokens.items():
                                    if other_id != op.id:
                                          print(f"Updating player {op.id} with stones from player {other_id}: {stones}")
                                          op.update_others_guessing_stones(other_id, stones)
                        p.wrong_rule(rule)
                        num_players = len(players)
                        for i in range(num_players):
                              player_index = (state.player + i) % num_players
                              op = players[player_index]
                              op.system_message(f"Player {p.id} guessed an incorrect rule: {rule}. A counter example will be provided.")
                        counter = gm.disprove_guess(rule)
                        print(f"Counter example for guess {rule}: {counter}")
                        if counter:
                              for _, ps in enumerate(players):
                                    ps.observe(counter, description=f"Counter example for incorrect rule guess ({rule})")
                              state.examples.append(counter)
                        else:
                              print(f"No counter example found for guess: Player won")
                              state.won = True
                              state.current_turn = Turn.END
                              num_players = len(players)
                              for i in range(num_players):
                                    player_index = (state.player + i) % num_players
                                    op = players[player_index]
                                    op.system_message(f"Player {state.player} guessed a rule: {rule}, the Gamemaster could not disprove. Game over. True Rule: {gm.true_program}")
                              state.game_over_reason = f"Player {p.id} guessed different rule but no counter example found"
                              duration = time.time() - state.turn_timer_start
                              state.turn_durations[state.turn] = duration
                              print(f"⏱️ Turn {state.turn} duration: {duration:.2f} seconds")
                              state.turn_timer_start = None
                              return state

            state.current_turn = Turn.PROPOSE
       
      elif state.current_turn == Turn.GUESS_BRAMLEY:
            print("Players guessing rules")
            test_examples = gm.test_scenes()
            state.bramley_test_examples = test_examples
            random.shuffle(test_examples)
            examples, path = zip(*test_examples)
            tensors, labels = zip(*examples)
            num_players = len(players)
            for i in range(num_players):
                  player_index = (state.player + i) % num_players
                  p = players[player_index]
                  correct_guesses = []
                  guessed_labels, rule = p.guess_labels(path)
                  for guessed_label, label in zip(guessed_labels, labels):
                      correct_guesses.append(guessed_label == label)
                  state.bramley_guesses[p.id] = [labels, guessed_labels, correct_guesses]
                  state.bramley_rule = str(rule)
            state.current_turn = Turn.END
      save_game(state, gm, players)
      return state

@dataclass
class GameCache:
    state: GameState
    gm_remaining_examples: list
    player_data: list[dict]

    def to_file(self, filename="zendo_cache.pkl"):
        with open(filename, "wb") as f:
            pickle.dump(self, f)

    @classmethod
    def from_file(cls, filename="zendo_cache.pkl"):
        with open(filename, "rb") as f:
            return pickle.load(f)
        
def save_game(state, gm, players, filename="zendo_cache.pkl"):
    cache = GameCache(
        state=state,
        gm_remaining_examples=gm.remaining_examples,
        player_data=[
            {
                "id": p.id,
                "guessing_stones": p.guessing_stones,
                "incorrect_rules": p.incorrect_rules,
                "last_label": p.last_label,
                "examples": p.examples,
                "previous_guesses": p.previous_guesses,
            }
            for p in players
        ]
    )
    cache.to_file(filename)