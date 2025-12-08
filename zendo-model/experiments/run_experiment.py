import concurrent
from cons_list import cons_list2list
import typing
import ray
from ray.util.queue import Empty
import tqdm
from grammar.pcfg import PCFG
import logging
from program import BasicPrimitive, Function, Lambda, New, Program, Variable
import time
from typing import Callable, List, Tuple
import grammar_splitter
from Algorithms.ray_parallel import start, make_parallel_pipelines

from Algorithms.heap_search import heap_search
from Algorithms.threshold_search import threshold_search

from program_as_list import reconstruct_from_compressed

logging_levels = {0: logging.INFO, 1: logging.DEBUG}


verbosity = 0
logging.basicConfig(format='%(message)s', level=logging_levels[verbosity])
timeout = 300
total_number_programs = 100_000_000
# Set to False to disable bottom cached evaluation for heap search
use_heap_search_cached_eval = True 

list_algorithms = [
    (heap_search, 'Heap Search', {}),
    # (heap_search_naive, 'heap search naive', {}),
]
# Set of algorithms where we need to reconstruct the programs
reconstruct = {threshold_search}

def canonicalize_program(prog: Program) -> Program:
    if not isinstance(prog, Function):
        return prog

    fn = prog.function
    args = [canonicalize_program(arg) for arg in prog.arguments]

    # Check if it's a commutative + redundant case
    if isinstance(fn, BasicPrimitive):
        name = fn.primitive
        if name in {"ODD_2", "EVEN_2"}:
            if args[0].typeless_eq(args[1]):
                # Rewriting
                if name == "ODD_2":
                    return Function(BasicPrimitive("ODD_1"), [args[0]])
                elif name == "EVEN_2":
                    return Function(BasicPrimitive("EVEN_1"), [args[0]])
        elif name in {"EXACTLY_2", "AT_LEAST_2"}:
            if args[1].typeless_eq(args[2]):
                if name == "AT_LEAST_2":
                    return Function(BasicPrimitive("AT_LEAST_1"), [args[0]])
                elif name == "EXACTLY_2":
                    return Function(BasicPrimitive("EXACTLY_1"), [args[0]])

    return Function(fn, args)

COMMUTATIVE_FUNCS = {"OR", "AND", "TOUCHING", "EXACTLY_2", "AT_LEAST_2", "ODD_2", "EVEN_2", "EITHER_OR", "SAME_AMOUNT", "ZERO_2"}
def normalize_program_structure(prog: Program) -> Program:
    if isinstance(prog, Function):
        head = prog.function
        args = [normalize_program_structure(arg) for arg in prog.arguments]

        if isinstance(head, BasicPrimitive) and head.primitive in COMMUTATIVE_FUNCS:
            args = sorted(args, key=lambda x: str(x))  # Or use another stable order
        return Function(head, args)

    elif isinstance(prog, Lambda):
        return Lambda(normalize_program_structure(prog.body))

    elif isinstance(prog, New):
        return New(normalize_program_structure(prog.body))

    return prog  # Variable or BasicPrimitive

def run_algorithm(is_correct_program: Callable[[Program, bool], bool], pcfg: PCFG, algo_index: int, accuracy=1, incorrect_rules=[], amount=2) -> List[Tuple[Program, float, float, int, float, float, float]]:
    '''
    Run the algorithm until either timeout or 1M programs, and for each program record probability and time of output
    return program, search_time, evaluation_time, nb_programs, cumulative_probability, probability
    '''
    algorithm, name_algo, param = list_algorithms[algo_index]
    n_candidates = amount
    search_time = 0
    evaluation_time = 0
    gen = algorithm(pcfg, **param)
    seen_programs = set()
    if name_algo == "SQRT":
        _ = next(gen)
    nb_programs = 0
    cumulative_probability = 0
    cached_eval = use_heap_search_cached_eval and algorithm == heap_search
    probability = 0
    program_candidates = []
    while (search_time + evaluation_time < timeout and nb_programs < total_number_programs):

        # Searching for the next program
        search_time -= time.perf_counter()
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(next, gen)
                try:
                    program = future.result(timeout=5)  # seconds allowed for one call
                except concurrent.futures.TimeoutError:
                    print(f"Generator timed out after 5 seconds at program #{nb_programs}")
                    break
        except:
            search_time += time.perf_counter()
            logging.debug(
                "Output the last program after {}".format(nb_programs))
            break  # no next program

  
        search_time += time.perf_counter()
        # logging.debug('program found: {}'.format(program))

        if program == None:
            logging.debug(
                "Output the last program after {}".format(nb_programs))
            break

        nb_programs += 1
        # Reconstruction if needed
        if algorithm in reconstruct:
            target_type = pcfg.start[0]
            program_r = reconstruct_from_compressed(program, target_type)
            probability = pcfg.probability_program(pcfg.start, program_r)
        else:
            probability = pcfg.probability_program(pcfg.start, program)
            program_r = program
        cumulative_probability += probability
        # logging.debug('probability: %s' %
        #               probability)
        # Evaluation of the program
        norm = normalize_program_structure(program_r)
        head = program_r.function
        args = [normalize_program_structure(arg) for arg in program_r.arguments]
        if isinstance(head, BasicPrimitive) and head.primitive == "MORE_THAN" and args[0].typeless_eq(args[1]):
            continue
        if isinstance(head, BasicPrimitive) and head.primitive == "==" and args[0].typeless_eq(args[1]):
            continue
        if isinstance(head, BasicPrimitive) and head.primitive == "!=" and args[0].typeless_eq(args[1]):
            continue
        canonical = canonicalize_program(norm)
        if str(canonical) in seen_programs or str(canonical) != str(norm) or str(canonical) in incorrect_rules:
            continue
        seen_programs.add(str(canonical))
        evaluation_time -= time.perf_counter()
        #TODO: change False to cached_eval to enable caching
        program_accuracy = is_correct_program(program_r, False)
        evaluation_time += time.perf_counter()
        # if not isinstance(found, bool):
        #     found, program = found

        if nb_programs % 100_000 == 0:
            logging.debug('tested {} programs'.format(nb_programs))

        # if candidates is smaller than n_candidates, add program to candidates
        if len(program_candidates) < n_candidates:
            program_candidates.append((program_accuracy, (
                program_r,
                search_time,
                evaluation_time,
                nb_programs,
                cumulative_probability,
                program_accuracy,
                probability
            )))
        else:
            # add program to candidates if accuracy is higher than current least best in candidates
            min_acc = min([candidate[0] for candidate in program_candidates])
            if program_accuracy > min_acc:
                # remove the least accurate candidate
                program_candidates.remove(min(program_candidates, key=lambda x: x[0]))
                program_candidates.append((program_accuracy, (
                    program_r,
                    search_time,
                    evaluation_time,
                    nb_programs,
                    cumulative_probability,
                    program_accuracy,
                    probability
                )))
            
            if len(program_candidates) == n_candidates:
                if all(acc >= accuracy for acc, _ in program_candidates):
                    print("\tFound {} high-accuracy programs, stopping search.".format(len(program_candidates)))
                    break

    # logging.debug("\nNot found")
    # logging.debug('[NUMBER OF PROGRAMS]: %s' % nb_programs)
    # logging.debug("[SEARCH TIME]: %s" % search_time)
    # logging.debug("[EVALUATION TIME]: %s" % evaluation_time)
    # logging.debug("[TOTAL TIME]: %s" % (evaluation_time + search_time))
    # print("\tratio s/(s+e)=", search_time / (search_time + evaluation_time))
    # print("\tNot found after", nb_programs, "programs\n\tcumulative probability=",
        #   cumulative_probability, "\n\tlast probability=", probability)
    program_candidates.sort(key=lambda x: x[0], reverse=True)
    top_programs = [candidate[1] for candidate in program_candidates]
    return top_programs

def insert_prefix(prefix, prog):
    try:
        head, tail = prog
        return (head, insert_prefix(prefix, tail))
    except:
        return prefix


def reconstruct_from_list(program_as_list, target_type):
    if len(program_as_list) == 1:
        return program_as_list.pop()
    else:
        P = program_as_list.pop()
        if isinstance(P, (New, BasicPrimitive)):
            list_arguments = P.type.ends_with(target_type)
            arguments = [None] * len(list_arguments)
            for i in range(len(list_arguments)):
                arguments[len(list_arguments) - i - 1] = reconstruct_from_list(
                    program_as_list, list_arguments[len(
                        list_arguments) - i - 1]
                )
            return Function(P, arguments)
        if isinstance(P, Variable):
            return P
        assert False


def insert_prefix_toprog(prefix, prog, target_type):
    prefix = cons_list2list(prefix)
    return reconstruct_from_list([prog] + prefix, target_type)

def run_algorithm_parallel(is_correct_program: Callable[[Program, bool], bool], pcfg: PCFG, algo_index: int, splits: int,
                           n_filters: int = 4, transfer_queue_size: int = 500_000, transfer_batch_size: int = 10) -> Tuple[Program, float, typing.List[float], typing.List[float], typing.List[int], typing.List[float], float]:
    '''
    Run the algorithm until either timeout or 1M programs, and for each program record probability and time of output
    return program, search_time, evaluation_time, nb_programs, cumulative_probability, probability
    '''
    algorithm, _, param = list_algorithms[algo_index]
    cached_eval = use_heap_search_cached_eval and algorithm == heap_search

    @ray.remote
    class DataCollectorActor:
        def __init__(self, n_filters, n_producers):
            self.search_times = [0] * n_producers
            self.probabilities = [0] * n_producers
            self.generated_programs = [0] * n_producers
            self.evaluations_times = [0] * n_filters
            self.evaluated_programs = [0] * n_filters
            self.programs = 0

        def add_search_data(self, index, t, probability) -> bool:
            self.search_times[index] += t
            self.probabilities[index] += probability
            self.generated_programs[index] += 1
            if self.search_times[index] > timeout:
                return True
            if self.programs > total_number_programs:
                return True

            return False

        def add_evaluation_data(self, index, t):
            self.evaluations_times[index] += t
            self.evaluated_programs[index] += 1
            self.programs += 1

        def search_data(self):
            return self.search_times, self.probabilities, self.generated_programs

        def evaluation_data(self):
            return self.evaluations_times, self.evaluated_programs

    data_collector = DataCollectorActor.remote(n_filters, splits)

    def bounded_generator(prefix, cur_pcfg, i):
        if algorithm in reconstruct:
            def new_gen():
                gen = algorithm(cur_pcfg, **param)
                target_type = pcfg.start[0]
                try:
                    while True:
                        t = -time.perf_counter()
                        prog = next(gen)
                        t += time.perf_counter()
                        prog_r = reconstruct_from_compressed(prog, target_type)
                        probability = pcfg.probability_program(pcfg.start, prog_r)
                        if ray.get(data_collector.add_search_data.remote(i, t, probability)):
                            break
                        yield prog_r
                except StopIteration:
                    pass
        else:
            def new_gen():
                gen = algorithm(cur_pcfg, **param)
                try:
                    while True:
                        t = -time.perf_counter()
                        p = next(gen)
                        if prefix is None:
                            prog = p
                            t += time.perf_counter()
                        else:
                            prog = insert_prefix_toprog(prefix, p, pcfg.start[0])
                            t += time.perf_counter()

                        if prog is None:
                            continue
                        probability = pcfg.probability_program(
                            pcfg.start, prog)
                        if ray.get(data_collector.add_search_data.remote(i, t, probability)):
                            break
                        yield prog
                except StopIteration:
                    pass
        return new_gen
    
    grammar_split_time = - time.perf_counter()
    splits = grammar_splitter.split(pcfg, splits, alpha=1.05)[0]
    grammar_split_time += time.perf_counter() 
    make_generators = [bounded_generator(
            None, pcfg, i) for i, pcfg in enumerate(splits)]

    def make_filter(i):
        def evaluate(program):
            t = -time.perf_counter()
            found = is_correct_program(program, cached_eval)
            t += time.perf_counter()
            if not isinstance(found, bool):
                found, program = found
            data_collector.add_evaluation_data.remote(i, t)
            return found
        return evaluate

    producers, filters, transfer_queue, out = make_parallel_pipelines(
        make_generators, make_filter, n_filters, transfer_queue_size, splits, transfer_batch_size)
    start(filters)
    logging.debug("\tStarted {} filters.".format(len(filters)))
    start(producers)
    logging.debug("\tStarted {} producers.".format(len(producers)))

    found = False
    while not found:
        try:
            program = out.get(timeout=.5)
            found = True
        except Empty:
            pass
        search_times, cumulative_probabilities, nb_programs = ray.get(
            data_collector.search_data.remote())
        if sum(nb_programs) > total_number_programs:
            break

    logging.debug(
        "\tFinished search found={}. Now shutting down...".format(found))
    search_times, cumulative_probabilities, nb_programs = ray.get(data_collector.search_data.remote())
    evaluation_times, evaluated_programs = ray.get(data_collector.evaluation_data.remote())
    logging.debug(
        "\tStats: found={} generated programs={} evaluated programs={} covered={:.1f}%".format(found, sum(nb_programs), sum(evaluated_programs), 100*sum(cumulative_probabilities)))
        
    # Shutdown
    for producer in producers:
        try:
            ray.kill(producer)
        except ray.exceptions.RayActorError:
            continue
    for filter in filters:
        try:
            ray.kill(filter)
        except ray.exceptions.RayActorError:
            continue
    transfer_queue.shutdown(True)
    out.shutdown(True)

    logging.debug("\tShut down.")


    if found:
        probability = pcfg.probability_program(pcfg.start, program)
        return program, grammar_split_time, search_times, evaluation_times, nb_programs, cumulative_probabilities, probability
    return None, grammar_split_time, search_times, evaluation_times, nb_programs, cumulative_probabilities, 0


def gather_data(dataset: typing.List[Tuple[str, PCFG, Callable]], algo_index: int, accuracy=1, incorrect_rules=[], amount=2) -> typing.List[Tuple[str, List[Tuple[Program, float, float, int, float, float, float]]]]:
    algorithm, _, _ = list_algorithms[algo_index]
    logging.info('\n## Running: %s' % algorithm.__name__)
    output = []
    successes = 0
    pbar = tqdm.tqdm(total=len(dataset))
    pbar.set_postfix_str(f"{successes} solved")
    for task_name, pcfg, is_correct_program in dataset:
        data = run_algorithm(is_correct_program, pcfg, algo_index, accuracy, incorrect_rules, amount)
        if not data:
            print("\tsolution=", task_name)
            print("\ttype request=", pcfg.type_request())
            data = [(None, 0.0, 0.0, 0, 0.0, 0.0, 0.0)]
        if isinstance(task_name, Program):
            try:
                prob = pcfg.probability_program(pcfg.start, task_name)
                if data == [(None, 0.0, 0.0, 0, 0.0, 0.0, 0.0)]:
                    print("\tsolution probability=", prob)
            except KeyError as e:
                print("Failed to compute probability of:", task_name)
                print("Error:", e)
        successes_per_list = 0
        for d in data:
            if d[0] is not None:
                successes_per_list += 1
        successes += successes_per_list
        output.append((task_name, data))
        pbar.update(1)
        pbar.set_postfix_str(f"{successes} solved")
    pbar.close()
    return output


def gather_data_parallel(dataset: typing.List[Tuple[str, PCFG, Callable]], algo_index: int, splits: int, n_filters: int = 4, transfer_queue_size: int = 500_000, transfer_batch_size: int = 10) -> typing.List[Tuple[str, Tuple[Program, float, typing.List[float], typing.List[float], typing.List[int], typing.List[float], float]]]:
    algorithm, _, _ = list_algorithms[algo_index]
    logging.info('\n## Running: %s with %i CPUs' % (algorithm.__name__, splits))
    output = []
    pbar = tqdm.tqdm(total=len(dataset))
    successes = 0
    pbar.set_postfix_str(f"{successes} solved")

    for task_name, pcfg, is_correct_program in dataset:
        logging.debug("## Task:", task_name)
        data = run_algorithm_parallel(
            is_correct_program, pcfg, algo_index, splits, n_filters, transfer_queue_size, transfer_batch_size)
        output.append((task_name, data))
        successes += data[0] is not None
        pbar.update(1)
        pbar.set_postfix_str(f"{successes} solved")
    pbar.close()
    return output
