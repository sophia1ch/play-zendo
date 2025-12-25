
import pickle
import torch
from pathlib import Path
import json
from DSL import zendo
from DSL import zendo_extended
from data.create_programs import convert_prolog_to_dsl, remove_generate_valid_structure
from grammar import dsl
from model_loader import __build_generic_zendo_model
from zendo.game import difficulty, play_game_state
from zendo.game_master import ZendoStateGameMaster
from zendo.player import GPTQueryZendoPlayer, HeuristicZendoPlayer, ZendoPlayer, FullGPTZendoPlayer
from zendo_vision.zendo_classification.zendo_detection.model import ZendoImageToVectorModel
import shutil
import traceback, sys
import random

def setup_game(mode: str, player_type: str, task_index: int):
    base_cfg = {
        "max_objects": 7,
        "token_dim": 384,
        "color_lexicon": ["red", "blue", "yellow"],
        "shape_lexicon": ["block", "wedge", "pyramid"],
        "orientation_lexicon": ["upright", "upside_down", "flat", "cheesecake"],
        "dropout": 0.23,
        "layers": 4,
        "pointing_mult_layer": True,
        "touching_mult_layer": True,
        "bbox_mult_layer": True,
        "color_mult_layer": False,
        "shape_mult_layer": False,
        "orientation_mult_layer": False,
        "presence_mult_layer": False,
    }
    visionmodel = ZendoImageToVectorModel(
        base_cfg,
        num_output_tokens=base_cfg["max_objects"],
        token_dim=base_cfg["token_dim"],
        max_objects=base_cfg["max_objects"],
        num_colors=len(base_cfg["color_lexicon"]) + 1,
        num_shapes=len(base_cfg["shape_lexicon"]) + 1,
        num_orientations=len(base_cfg["orientation_lexicon"]) + 1,
    )
    ckpt_path = Path("zendo_model.pt")
    visionmodel.load_state_dict(torch.load(ckpt_path, map_location="cpu", weights_only=True))
    visionmodel.eval()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    visionmodel.to(device)

    zendo_dsl = dsl.DSL(zendo.semantics, zendo.primitive_types, None)
    cfg, model = __build_generic_zendo_model(dsl=zendo_dsl, max_program_depth=5, size_max=11, size_hidden=64, embedding_output_dimension=78, number_layers_RNN=1, autoload=True, name="model_weights/bigramsPredictor_variable.weights")
    # --- Load Dataset ---
    def load_zendo_dataset(pkl_path="data/game_tasks.pkl"):
        print("Loading Zendo dataset...")
        with open(pkl_path, "rb") as f:
            tasks = pickle.load(f)
        return tasks

    tasks = load_zendo_dataset()
    print(f"Total tasks in dataset: {len(tasks)}")
    task = tasks[task_index]
    name, examples, images = task
    program = convert_prolog_to_dsl(name, cfg)
    print(f"Selected task {task_index} with {len(examples)} examples.")
         
    if player_type == "reductive":
        player = ZendoPlayer(player_id=0, task_idx=task_index, cfg=cfg, dsl=zendo_dsl, model=model, bar=5e-9, prefer_valid=False, min_examples=4, images=True, gs_threshold=1, vision_model=visionmodel)
    elif player_type == "heuristic":
        player = HeuristicZendoPlayer(player_id=0, task_idx=task_index, cfg=cfg, dsl=zendo_dsl, model=model, images=True, vision_model=visionmodel)
    elif player_type == "gpt":
        player = GPTQueryZendoPlayer(player_id=0, task_idx=task_index, cfg=cfg, dsl=zendo_dsl, model=model, images=True, vision_model=visionmodel)
    elif player_type == "":
        player = FullGPTZendoPlayer(player_id=0, task_idx=task_index, cfg=cfg, dsl=zendo_dsl, model=model, images=True, vision_model=visionmodel)
    gm = ZendoStateGameMaster(true_program=program, task_idx=task_index, dataset=examples.copy(), paths=images.copy(), zendo_dsl=zendo_dsl, cfg=cfg, images=True, use_images=True, ask_for_counter=False)
    return gm, player, program, name, cfg