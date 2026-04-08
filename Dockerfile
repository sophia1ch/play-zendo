FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

# System dependencies: X libs for Blender headless, SWI-Prolog, Xvfb
RUN apt-get update && \
    apt-get install -y \
      libxxf86vm1 libx11-6 libxi6 libxfixes3 libxrandr2 \
      libxrender1 libxt6 xvfb swi-prolog git wget \
      libxkbcommon0 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Blender (headless) + install pyyaml into Blender's bundled Python
RUN wget -q https://download.blender.org/release/Blender4.4/blender-4.4.0-linux-x64.tar.xz && \
    tar -xf blender-4.4.0-linux-x64.tar.xz -C /usr/local/ && \
    ln -s /usr/local/blender-4.4.0-linux-x64/blender /usr/local/bin/blender && \
    rm blender-4.4.0-linux-x64.tar.xz && \
    /usr/local/blender-4.4.0-linux-x64/4.4/python/bin/python3.11 -m ensurepip && \
    /usr/local/blender-4.4.0-linux-x64/4.4/python/bin/python3.11 -m pip install pyyaml torch numpy pillow

# Python dependencies
WORKDIR /workspace
COPY zendo-model/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

WORKDIR /workspace/zendo-model
