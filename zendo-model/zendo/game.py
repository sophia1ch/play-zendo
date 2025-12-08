from zendo.game_master import ZendoStateGameMaster
from zendo.player import ZendoPlayerInterface
from zendo.States import GameCache, GameState, Turn, step

def difficulty(program: str) -> str:
    """Determine the difficulty of a Zendo program based on its structure."""
    if "INTERACTION" in program or "(AND" in program or "(OR" in program:
        return "difficult"
    elif "_2" in program or "IS_GROUNDED" in program or "IS_UNGROUNDED" in program:
        return "medium"
    else:
        return "easy"
    
def play_game_state(gm: ZendoStateGameMaster, players: list[ZendoPlayerInterface], cached=False) -> GameState:
    print("Starting game with program:", str(gm.true_program))
    diff = difficulty(str(gm.true_program))
    state = GameState(
        correct_program=str(gm.true_program),
        difficulty=diff,
        examples=[],
        guesses={i: [] for i in range(len(players))},
        examples_proposed={i: 0 for i in range(len(players))},
        player_guess_tokens={i: 0 for i in range(len(players))},
        current_turn=Turn.PROPOSE,
        last_action=None
    )
    if cached:
        cache_file="zendo_cache.pkl"
        cache = GameCache.from_file(cache_file)
        state = cache.state
        gm.remaining_examples = cache.gm_remaining_examples
        for p, pdata in zip(players, cache.player_data):
            p.guessing_stones = pdata["guessing_stones"]
            p.incorrect_rules = pdata["incorrect_rules"]
            p.previous_guesses = pdata.get("previous_guesses", [])
            p.last_label = pdata["last_label"]
            p.examples = pdata["examples"]
    else:
        for ex in gm.initial_examples():
            for p in players:
                p.observe(ex)
            state.examples.append(ex)

    while state.current_turn != Turn.END:
        state = step(state, players, gm)

    print("Finished: ", state.game_over_reason)
    return state

def play_bramley_game(gm: ZendoStateGameMaster, players: list[ZendoPlayerInterface]) -> GameState:
    diff = difficulty(str(gm.true_program))
    state = GameState(
        correct_program=str(gm.true_program),
        difficulty=diff,
        examples=[],
        guesses={i: [] for i in range(len(players))},
        examples_proposed={i: 0 for i in range(len(players))},
        player_guess_tokens={i: 0 for i in range(len(players))},
        current_turn=Turn.PROPOSE,
        last_action=None
    )

    ex = gm.initial_example()
    for p in players:
        p.observe(ex)
    state.examples.append(ex)

    while state.current_turn != Turn.END:
        state = step(state, players, gm, bramley=True)

    print("Finished: ", state.game_over_reason)
    return state