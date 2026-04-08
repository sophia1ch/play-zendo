# play-zendo
Repository holds backend and frontend to play Zendo against the zendo-model

## Clone the repository

```bash
git clone https://github.com/sophia1ch/play-zendo.git
cd play-zendo
git submodule update --init --recursive
```

## Run with Docker

The Docker image contains Blender, SWI-Prolog, and the conda environment. Code and data are mounted from the repo, so all generated output persists on your machine.

### Build the image

```bash
docker build -t zendo-docker:latest .
```

### Smoke test

Verifies imports, loads the dataset, and renders a test scene via Blender:

```bash
docker run --rm \
  -v "$(pwd)/zendo-model:/workspace/zendo-model" \
  -v "$(pwd)/zendo-synthetic-data:/workspace/zendo-synthetic-data" \
  zendo-docker:latest \
  python smoke_test.py
```

### Run the backend

```bash
docker run \
  -v "$(pwd)/zendo-model:/workspace/zendo-model" \
  -v "$(pwd)/zendo-synthetic-data:/workspace/zendo-synthetic-data" \
  -p 8000:8000 \
  -e PYTHONHASHSEED=0 \
  zendo-docker:latest \
  uvicorn main:app --host 0.0.0.0 --port 8000
```

The backend is available at `http://localhost:8000`.

## Run without Docker

### Prerequisites

Follow the instructions in `zendo-model/README.md` to set up the conda environment. If not already installed, install node and run:

```bash
npm install
```

### Start backend

```bash
cd zendo-model
conda activate zendo-model
export PYTHONHASHSEED=0
uvicorn main:app --reload --port 8000
```

### Start frontend

Open a new terminal:

```bash
cd frontend
npm run dev
```
