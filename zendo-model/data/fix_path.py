from pathlib import Path
import pickle
import sys

old_prefix = "../../4_Semester/zendo-synthetic-data/"
new_prefix = "../zendo-synthetic-data/"

def update_paths_in_pickle(input_path, output_path):
    # Load original pickle
    with open(input_path, "rb") as f:
        data = pickle.load(f)

    new_data = []
    for entry in data:
        # Expecting (name, list_of_tensors, path)
        name, tensors, paths = entry
        new_paths = []
        for path in paths:
            path = str(path)
            if path.startswith(old_prefix):
                new_path = new_prefix + path[len(old_prefix):]
                new_path = Path(new_path)
            else:
                print(f"Path does not match expected prefix: {path}")
                new_path = Path(path)
                
            new_paths.append(new_path)
        new_data.append((name, tensors, new_paths))

    # Save updated data to new pickle
    with open(output_path, "wb") as f:
        pickle.dump(new_data, f)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: python {sys.argv[0]} input.pkl output.pkl")
        sys.exit(1)

    input_pkl = sys.argv[1]
    output_pkl = sys.argv[2]

    update_paths_in_pickle(input_pkl, output_pkl)
    print(f"Updated pickle written to {output_pkl}")
