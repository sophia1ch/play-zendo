import subprocess
import os
import time
import torch
import shutil

def render_scene(scene, path):
    scene_str = str(scene)
    config_file = "generation/configs/simple_config.yml"
    output_dir = "generation/output"

    try:
        # with open(os.devnull, 'w') as DEVNULL:
        #     proc = subprocess.Popen(
        #         [
        #             "blender", "--background", "--python", "generation/render_single.py", "--",
        #             "--config-file", config_file,
        #             "--scene", scene_str,
        #             "--path", str(path),
        #         ],
        #         stdout=DEVNULL,
        #         stderr=DEVNULL,
        #         preexec_fn=os.setsid,
        #         env={**os.environ, "PYTHONPATH": os.getcwd()}
        #     )

        #     proc.wait()
        proc = subprocess.Popen(
            [
                "blender", "--background", "--python", "generation/render_single.py", "--",
                "--config-file", config_file,
                "--scene", scene_str,
                "--path", str(path),
            ],
            preexec_fn=os.setsid,
            env={**os.environ, "PYTHONPATH": os.getcwd()}
        )
        proc.wait()  

        # Wait a moment for filesystem sync if needed
        time.sleep(1)

        # Read the results
        image_tensor = torch.load(os.path.join(output_dir, (str(path) + ".pt")), weights_only=True)
        return image_tensor
    except Exception as e:
        print(f"Error rendering scene: {e}")
        return None
