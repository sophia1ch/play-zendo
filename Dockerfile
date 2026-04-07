FROM nvcr.io/nvidia/pytorch:24.03-py3

# System dependencies: X libs for Blender headless, SWI-Prolog, Xvfb
RUN apt-get update && \
    apt-get install -y \
      libxxf86vm1 libx11-6 libxi6 libxfixes3 libxrandr2 \
      libxrender1 libxt6 xvfb swi-prolog git wget \
      libxkbcommon0 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Blender (headless)
RUN wget -q https://download.blender.org/release/Blender4.4/blender-4.4.0-linux-x64.tar.xz && \
    tar -xf blender-4.4.0-linux-x64.tar.xz -C /usr/local/ && \
    ln -s /usr/local/blender-4.4.0-linux-x64/blender /usr/local/bin/blender && \
    rm blender-4.4.0-linux-x64.tar.xz

# Miniconda
RUN wget -q https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O /tmp/miniconda.sh && \
    bash /tmp/miniconda.sh -b -p /opt/conda && \
    rm /tmp/miniconda.sh
ENV PATH=/opt/conda/bin:$PATH

# Accept Anaconda ToS for default channels
RUN conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main && \
    conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r

# Create conda environment
WORKDIR /workspace
COPY zendo-model/environment_fixed.yml .
RUN conda env create -n zendo-model -f environment_fixed.yml && conda clean --all -y

# Put the zendo-model env on PATH so it's used by default (no conda run needed)
ENV PATH=/opt/conda/envs/zendo-model/bin:$PATH

# Copy application code and synthetic data
COPY zendo-model/ /workspace/zendo-model/
COPY zendo-synthetic-data/ /workspace/zendo-synthetic-data/

WORKDIR /workspace/zendo-model

# Create writable runtime directories
RUN mkdir -p gamestates/gamestates_study_test \
             gamestates/gamestates_human \
             generation/output \
             cached_states

