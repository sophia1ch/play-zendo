# zendo-model
This repository holds all necessary code to run a vision based zendo player, including a trained object detection model and a program synthesis model.

## Submodule
This repository depends on code from https://github.com/sophia1ch/vision-model.
Initialize the submodule with:
```bash
git submodule update --init --recursive
```

## Setup
First download the zendo-model weights file ```zendo_model.pt``` from https://huggingface.co/ss567uhg/zendo-vision/tree/main/model into root.
Then create a conda environment:
```bash
conda env create -f environment.yml
conda activate zendo-model
```
> [!IMPORTANT]  
> SWI-Prolog must be installed and properly set up on your system for the generation process to work. Without it, the scripts will be unable to execute the project's Prolog logic.


