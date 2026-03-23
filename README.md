# play-zendo
Repository holds backend and frontend to play Zendo against the zendo-model

## Submodule
This repository depends on code from https://github.com/sophia1ch/Master_thesis.
Initialize the submodule with:
```bash
git submodule update --init --recursive
```

# Prerequisites
Follow the instructions in zendo-model/README.md
If not already installed, install node and run:
```bash
npm install
```

# Run Game
Start backend:
```bash
cd zendo-model
conda activate zendo-model
export PYTHONHASHSEED=0
uvicorn main:app --reload --port 8000
```
Open a new terminal and start frontend:
```bash
cd frontend
npm run dev
```