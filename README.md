# play-zendo
Repository holds backend and frontend to play Zendo against the zendo-model

# Prerequisites
Follow the instructions in zendo-model/README.md

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