import random
import torch
import csv
import os
import pickle
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))
from type_system import BOOL, Arrow, List
from experiments.run_experiment import gather_data, list_algorithms
from DSL import zendo
import grammar.dsl as dsl
from model_loader import __build_generic_zendo_model, __buildintlist_zendo_model
from experiment_helper import task_set2zendodataset

# --- Configuration ---
dataset_name = "zendo"
save_folder = "experiment-output"

# --- Load Dataset ---
def load_zendo_dataset(pkl_path="data/zendo_test_tensors_filtered.pkl"):
    with open(pkl_path, "rb") as f:
        tasks = pickle.load(f)
    return tasks

tasks = load_zendo_dataset()
print("Loaded", len(tasks))

base_symbols = ["red", "blue", "yellow", "pyramid", "wedge", "block", "upright", "flat", "upside_down", "cheesecake", "vertical"]
max_objects = 7
zendo_dsl = dsl.DSL(zendo.semantics, zendo.primitive_types, None)
bigrams_cfg, bigrams_model = __build_generic_zendo_model(dsl=zendo_dsl, max_program_depth=5, size_max=11, size_hidden=64, embedding_output_dimension=78, number_layers_RNN=1, autoload=True, name="model_weights/bigramsPredictor.weights")
rules_cfg, rules_model = __buildintlist_zendo_model(dsl=zendo_dsl, max_program_depth=5, size_max=11, size_hidden=64, embedding_output_dimension=78, number_layers_RNN=1, autoload=True, name="model_weights/rulesPredictor_1.weights")
bigrams_v_cfg, bigrams_v_model = __build_generic_zendo_model(dsl=zendo_dsl, max_program_depth=5, size_max=11, size_hidden=64, embedding_output_dimension=78, number_layers_RNN=1, autoload=True, name="model_weights/bigramsPredictor_variable.weights")
# rules_v_cfg, rules_v_model = __buildintlist_zendo_model(dsl=zendo_dsl, max_program_depth=5, size_max=11, size_hidden=64, embedding_output_dimension=78, number_layers_RNN=1, autoload=True, name="model_weights/rulesPredictor_variable.weights")
# type_request = Arrow(List(zendo.PIECE), BOOL)
# cfg = zendo_dsl.DSL_to_CFG(
#     type_request, max_program_depth=5)
# --- Convert Tasks to Dataset ---
print(len(tasks), "tasks loaded.")
examples = [(task[0], task[1]) for task in tasks]
bigrams_dataset = task_set2zendodataset(tasks[:50], bigrams_model, zendo_dsl, bigrams_cfg, use_model=True)
rules_dataset = task_set2zendodataset(tasks[:50], rules_model, zendo_dsl, rules_cfg, use_model=True)
bigrams_v_dataset = task_set2zendodataset(tasks[:50], bigrams_v_model, zendo_dsl, bigrams_v_cfg, use_model=True)
# rules_v_dataset = task_set2zendodataset(tasks[:1], rules_v_model, zendo_dsl, rules_v_cfg, use_model=True)
# random_dataset = task_set2zendodataset(tasks[:50], None, zendo_dsl,  cfg, use_model=False)
# uniform_dataset = task_set2zendodataset(tasks[:50], None, zendo_dsl, cfg, use_model=False, uniform=True)
# --- Run Inference & Export Results ---
for algo_index in range(len(list_algorithms)):
    print("Running algorithm index:", algo_index)
    algo_name = list_algorithms[algo_index][1]
    if algo_name != "Heap Search":
        print(f"Skipping algorithm {algo_name} as it is not 'heap search'.")
        continue

    print("Starting...")
    for splits in [2]:
        for i, dataset in enumerate([bigrams_dataset, rules_dataset, bigrams_v_dataset]):
            filename = f"{save_folder}/model_evaluation_{i}.csv"
            if os.path.exists(filename):
                print("Already exists:", filename)
                continue

            print(f"Running {algo_name} with {splits} CPUs...")
            data = gather_data(dataset, 0, 1, [], 10)
            col_names = ["task_name", "program", "search_time", "evaluation_time",
                         "nb_programs", "cumulative_probability", "accuracy", "probability"]

            processed_data = []
            for task_name, results in data:
                for result in results:
                    program, search_time, evaluation_time, nb_programs, cumulative_probability, accuracy, probability = result

                    # Format each row as one program result for this task
                    processed_data.append([
                        str(task_name),
                        str(program),
                        search_time,
                        evaluation_time,
                        nb_programs,
                        cumulative_probability,
                        accuracy,
                        probability
                    ])

            with open(filename, "w", newline='') as fd:
                writer = csv.writer(fd)
                writer.writerow(col_names)
                writer.writerows(processed_data)

            print("Saved results to", filename)
